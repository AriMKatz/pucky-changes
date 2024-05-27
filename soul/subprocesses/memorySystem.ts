
import { ChatMessageRoleEnum, MentalProcess, WorkingMemory, createCognitiveStep, indentNicely, stripEntityAndVerb, stripEntityAndVerbFromStream, useActions, useProcessMemory, useSoulMemory, useSoulStore, z } from "@opensouls/engine";
import instruction from "../cognitiveSteps/instruction.js";
import { BIG_MODEL, FAST_MODEL } from "../lib/models.js";


// Step 1: Extract entities from the conversation
const extractEntities = createCognitiveStep(() => {
  const params = z.object({
    entities: z.array(z.object({
      key: z.string(),
      name: z.string(),
      description: z.string().describe(indentNicely`
        New information gleamed about this entity from the conversation so far.
      `)
    })).describe("List of entities mentioned in the conversation.")
  });

  return {
    command: ({ soulName: name }: WorkingMemory) => {
      return {
        role: ChatMessageRoleEnum.System,
        name: name,
        content: indentNicely`
          Extract all relevant entities from the conversation so far. 
          Entities include not just names, but also important facts, events, and details that should be remembered.
          
          Consider the following:
          - Names of people, places, or organizations
          - Key facts or statements made during the conversation
          - Important events or actions that have taken place
          - Any other details that might be relevant for future reference

          Rules:
          - Keep descriptions concise and in note-taking language that Pucky would use.
          - keep the 'key' field database safe (no spaces, special characters, etc.)
          - Use the 'name' field for the actual name of the entity.
        `
      };
    },
    schema: params,
    postProcess: async (memory: WorkingMemory, response: z.output<typeof params>) => {
      const entities = response.entities;
      const newMemory = {
        role: ChatMessageRoleEnum.Assistant,
        content: `${memory.soulName} thought the following is interesting: ${JSON.stringify(entities, null, 2)}`
      };
      return [newMemory, entities];
    }
  };
});

const combineEntityDescriptions = createCognitiveStep(({
  name,
  descriptions
}: {
  name: string;
  descriptions: string[];
}) => {

  return {
    command: ({ soulName: name }: WorkingMemory) => {
      return {
        role: ChatMessageRoleEnum.System,
        name: name,
        content: indentNicely`
          Combine the following descriptions of ${name} into a single cohesive description:

          ${descriptions.map((desc) => indentNicely`
            * ${desc}
          `).join("\n\n")}

          Rules:
          - Ensure the combined description is concise and clear.
          - Maintain the important details from both descriptions.
          - Avoid redundancy and repetition.
          - Keep descriptions in note-taking language that Pucky would use.
        `
      };
    },
  };
});


const memorySystem: MentalProcess = async ({ workingMemory }) => {
  const { log } = useActions()
  const needingClustering = useProcessMemory<string[]>([])
  const { set, fetch, search, 'delete': remove } = useSoulStore();
  const liveMemory = useSoulMemory("liveMemory", "No memories yet.")
  const [, entities] = await extractEntities(
    workingMemory,
    undefined,
    { model: FAST_MODEL }
  );

  log('memorySystem', entities);

  for (const entity of entities) {
    needingClustering.current.push(entity.key);
    const existingEntity = await fetch<string>(entity.key);
    if (!existingEntity) {
      set(entity.key, indentNicely`
        # ${entity.name}
  
        ${entity.description}
      `);
      continue
    }

    // log("combineEntityDescriptions", entity.name, entity.description, existingEntity)
    const [, combinedDescription] = await combineEntityDescriptions(
      workingMemory,
      { name: entity.name, descriptions: [existingEntity, entity.description] },
      { model: FAST_MODEL }
    );

    set(entity.key, indentNicely`
      # ${entity.name}

      ${combinedDescription}
    `);
  }


  for (const key of needingClustering.current) {
    log('clustering', key)
    const entity = await fetch<string>(key);
    if (!entity) {
      log("no entity found for key: ", key)
      continue
    }

    let similar = await search(entity, { resultLimit: 10, minSimilarity: 0.8 });
    
    similar = similar.filter((s) => s.key !== key)

    log('similar', similar.length, similar.map((s) => s.similarity));

    if (similar.length === 0) {
      continue
    }
    const [, summary] = await combineEntityDescriptions(
      workingMemory,
      {
        name: key,
        descriptions: similar.map((s) => s.content as string)
      },
      {
        model: FAST_MODEL,
      }
    )

    // log("would new summary: ", summary)
    await set(key, summary)
    // log("removing: ", similar.map((s) => s.key))
    for (const similarEntity of similar) {
      await remove(similarEntity.key)
    }

    const [, cluster] = await instruction(
      workingMemory,
      indentNicely`
        Cluster the following information into a single cohesive description:

        ${entity}

        Rules:
        - Ensure the combined description is concise and clear.
        - Maintain the important details from all descriptions.
        - Avoid redundancy and repetition.
        - Keep descriptions in note-taking language that Pucky would use.
      `,
      { model: FAST_MODEL }
    );
    log('updating', key)
    set(key, cluster);
  }
  log("reset clustering")
  needingClustering.current.splice(0, needingClustering.current.length)

  if (workingMemory.length <= 4) {
    return workingMemory
  }

  const memories = await search(
    indentNicely`
      ${workingMemory.slice(-4).memories.map((mem) => mem.content).join("\n")}
    `, 
    { resultLimit: 10 }
  )

  const [, summarizedMemories] = await instruction(
    workingMemory,
    indentNicely`
      Please summarize these related memories into a coherent 1-2 paragraph narrative relevant to the current conversation.

      ## Memories
      ${memories.map((mem) => indentNicely`
        * ${mem.content}
      `).join("\n")}

      ## Rules
      Keep important details, put in Pucky's voice.
      Reply with only the summary, no formatting.
    `,
    { model: FAST_MODEL }
  )

  log("memories: ", memories.map((mem) => mem.key).join(", "))
  liveMemory.current = summarizedMemories

  return workingMemory
}

export default memorySystem

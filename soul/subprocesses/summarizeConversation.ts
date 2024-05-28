
import { ChatMessageRoleEnum, MentalProcess, WorkingMemory, createCognitiveStep, indentNicely, stripEntityAndVerb, stripEntityAndVerbFromStream, useActions, useProcessMemory, useSoulMemory } from "@opensouls/engine";
import { FAST_MODEL } from "../lib/models.js";
import internalMonologue from "../cognitiveSteps/internalMonologue.js";

const conversationNotes = createCognitiveStep((existing: string) => {
  return {
    command: ({ soulName: name }: WorkingMemory) => {
      return {
        role: ChatMessageRoleEnum.System,
        content: indentNicely`
          ## Existing notes
          ${existing}

          ## Description
          Write an updated and clear paragraph describing the conversation so far.
          Make sure to keep enough detail that if ${name} needed to return to this conversation with no memory, they could pick up where they left off just from these notes.

          ## Rules
          * Do _NOT_ use a main header like "## Notes" or "## Description" in your response, it should JUST be the notes, these notes will be dropped in another document with its own header. 
          * Keep descriptions as a paragraph
          * Keep relevant information from before
          * Use abbreviated language to keep the notes short
          * Make sure to detail the motivation of ${name} (what are they trying to accomplish, what have they done so far).
          
          Please reply with the updated notes on the conversation:
        `,
      }
    },
  }
})

export const INITIAL_CONVERSATION_NOTES = indentNicely`
  Pucky and the interlocutor are having their very first encounter. Pucky wants to find out about them by asking probing questions. Additionally, Pucky wants to morph into a personality state that the interlocutor will find really interesting, so they need to figure out what the interlocutor would like in a conversational sparring partner.
`

const summarizesConversation: MentalProcess = async ({ workingMemory }) => {
  const conversationModel = useSoulMemory("conversationSummary", INITIAL_CONVERSATION_NOTES)
  const { log } = useActions()

  let memory = workingMemory

  if (memory.memories.length > 9) {
    log("updating conversation notes");
    [memory] = await internalMonologue(
      memory,
      { instructions: "What have I learned in this conversation.", verb: "noted" },
      { model: FAST_MODEL },
    )

    const [, updatedNotes] = await conversationNotes(
      memory,
      conversationModel.current,
      { model: FAST_MODEL }
    )

    conversationModel.current = updatedNotes as string

    return workingMemory
      .slice(0,1)
      .concat(workingMemory.slice(-5))
  }

  return workingMemory
}

export default summarizesConversation

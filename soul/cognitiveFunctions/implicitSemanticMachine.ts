import { ChatMessageRoleEnum, WorkingMemory, createCognitiveStep, indentNicely, useActions, usePerceptions, z } from "@opensouls/engine";

interface PickActionOptions { 
  goal: string,
  actions: Action[]
}

export type RecursionOpts = Partial<ImplicitSemanticMachineOptions> & { workingMemory: WorkingMemory }

export interface Action {
  name: string
  description: string
  handleActionUse: (memory: WorkingMemory, recurse: (opts: RecursionOpts) => Promise<WorkingMemory>) => Promise<WorkingMemory>
}

export interface ImplicitSemanticMachineOptions {
  workingMemory: WorkingMemory
  goal: string
  actions: Action[]
  playbook: string,
  model?: string
}

const pickAction = createCognitiveStep(({ goal, actions: tools }: PickActionOptions) => {
  const schema = z.object({
    toolChoice: z.enum(tools.map((tool) => tool.name) as [string, ...string[]]).describe("The action to take.")
  });

  return {
    schema,
    command: ({ soulName: name }: WorkingMemory) => {
      return {
        role: ChatMessageRoleEnum.System,
        name: name,
        content: indentNicely`
          ${name} picks what they do next. Keep in mind the goal: ${goal}

          ## Available Actions
          ${tools.map((tool) => `* ${tool.name}: ${tool.description}`).join('\n')}

          ${name} thinks carefully and chooses an action.
        `,
      };
    },
    postProcess: async (memory: WorkingMemory, response: z.infer<typeof schema>) => {
      const newMemory = {
        role: ChatMessageRoleEnum.Assistant,
        content: `${memory.soulName} chose the action: "${response.toolChoice}"`,
      };
      return [newMemory, response.toolChoice];
    },
  };
});

export const implicitSemanticMachine = async ({ workingMemory, goal, actions, playbook, model }: ImplicitSemanticMachineOptions): Promise<WorkingMemory> => {
  const { log } = useActions();
  const { pendingPerceptions } = usePerceptions();

  if (pendingPerceptions.current.length > 0) {
    return workingMemory;
  }

  let withPlaybook = workingMemory

  if (!workingMemory.some((mem) => mem.content === playbook)) {
    withPlaybook = workingMemory.withMemory({
      role: ChatMessageRoleEnum.User,
      name: "Interlocutor",
      content: playbook
    })
  }

  const [withActionChoice, actionChoice] = await pickAction(
    withPlaybook,
    { goal, actions },
    { model: model }
  );

  log('action choice', actionChoice)

  const handler = actions.find((action) => action.name === actionChoice)?.handleActionUse
  if (!handler) {
    throw new Error("missing handler for" + actionChoice)
  }

  const resp = await handler(withActionChoice, (opts: RecursionOpts) => {
    return implicitSemanticMachine({
      actions,
      goal,
      playbook,
      model,
      ...opts,
    })
  })

  return resp
}
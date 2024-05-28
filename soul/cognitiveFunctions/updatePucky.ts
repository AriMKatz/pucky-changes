import { WorkingMemory, indentNicely, useActions, useSoulMemory } from "@opensouls/engine";
import { INITIAL_PUCKY } from "../lib/initialPucky.js";
import { Action, implicitSemanticMachine } from "./implicitSemanticMachine.js";
import instruction from "../cognitiveSteps/instruction.js";
import { BIG_MODEL, FAST_MODEL } from "../lib/models.js";
import externalDialog from "../cognitiveSteps/externalDialog.js";

export const updatePucky = async ({ workingMemory, goal }: { workingMemory: WorkingMemory, goal: string }): Promise<WorkingMemory> => {
  const currentPucky = useSoulMemory("currentPucky", INITIAL_PUCKY)
  const { log, speak } = useActions()

  const originalWorkingMemory = workingMemory

  const playbook = indentNicely`
    Pucky is an adpative character and is tasked with updating its personality to match the instructions and desires of the interlocutor.

    Instructions;
    * write, edit, reflect until Plucky got the new personality right.

    Rules:
    * COMPLETELY REWRITE the personality system for Pucky from scratch. No need to keep any details from before.
    * Keep the personality system concise and clear.
    * include a high level *essence* of personality that an LLM could understand in order to role play well.
  `

  let editCount = 0

  const actions: Action[] = [
    {
      name: "write",
      description: "Write the new personality system for Pucky.",
      handleActionUse: async (workingMemory, recurse) => {

        log('handling action use for write')
        
        const [withPersonality, newPersonality] = await instruction(
          workingMemory,
          indentNicely`
            You are using the Soul Engine to model the mind of Pucky. Pucky is tasked with adapting its personality to match the instructions and desires of the interlocutor.

            <rules>
            * COMPLETELY REWRITE the personality system for Pucky from scratch. No need to keep any details from before.
            * Keep the personality system concise and clear.
            * This personality system will be used by GPT-4o to construct the system prompt and model the mind of Pucky.
            </rules>

            Respond only with the updated personality system for Pucky. No yapping.
          `,
          { model: BIG_MODEL }
        )

        currentPucky.current = newPersonality

        return recurse({
          actions: actions.filter(action => action.name !== "write"),
          workingMemory: withPersonality,
        })      
      },
    },
    {
      name: "edit",
      description: "edit the personality update",
      handleActionUse: async (workingMemory, recurse) => {
        log('handling action use for edit')
        
        const [withPersonality, newPersonality] = await instruction(
          workingMemory,
          indentNicely`
            Pucky has decided to edit his personality update.

            Respond only with the updated personality system for Pucky. No yapping.
          `,
          { model: BIG_MODEL }
        )

        currentPucky.current = newPersonality

        if (editCount > 3) {
          return withPersonality
        }

        editCount += 1
        return recurse({
          actions: actions.filter(action => action.name !== "write"),
          workingMemory: withPersonality,
        })
      }
    },
    {
      name: "complete",
      description: "finished writing the new personality",
      handleActionUse: async (workingMemory, _recurse) => {
        log('completed edit')
        const [withDialog, stream] = await externalDialog(
          workingMemory,
          "Tell the interlocutor what changes you made to your personality.",
          { stream: true, model: BIG_MODEL }
        );
        speak(stream);
      
        return originalWorkingMemory.concat(withDialog.slice(-1));
      }
    }
  ]

  return implicitSemanticMachine({
    actions,
    goal,
    playbook,
    workingMemory,
    model: FAST_MODEL,
  })
}

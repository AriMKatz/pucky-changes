
import { MentalProcess, indentNicely, useActions } from "@opensouls/engine";
import externalDialog from "./cognitiveSteps/externalDialog.js";
import { BIG_MODEL, FAST_MODEL } from "./lib/models.js";
import { Action, implicitSemanticMachine } from "./cognitiveFunctions/implicitSemanticMachine.js";
import instruction from "./cognitiveSteps/instruction.js";
import { updatePucky } from "./cognitiveFunctions/updatePucky.js";

const initialProcess: MentalProcess = async ({ workingMemory }) => {
  const { speak, log } = useActions()

  const playbook = indentNicely`
    Follow the conversational goals of the interlocutor, adapt to their manner of speaking. If needed then shift your whole personality, but in general that won't be necessary and you can just chat.
  `

  const actions: Action[] = [
    {
      name: "chat",
      description: "Continue the conversation with the interlocutor",
      handleActionUse: async (workingMemory, recurse) => {
        const [withDialog, stream] = await externalDialog(
          workingMemory,
          "Probe the interlocutor for a personality type that puck can become.",
          { stream: true, model: BIG_MODEL }
        );
        speak(stream);
      
        return withDialog;
      }
    },
    {
      name: "updatePuckyPersonality",
      description: "Update Pucky's personality to match a request from the interlocutor",
      handleActionUse: async (workingMemory, recurse) => {
        const [,goal] = await instruction(
          workingMemory,
          indentNicely`
            Pucky has decided to update their personality.
            Respond only with the *goal* of the personality update. What are some traits that they are looking to have, or describing details.
            Respond *only* with the new goal for the personality update.
          `,
          {
            model: BIG_MODEL,
          }
        )

        log("personality update goal", goal)

        return updatePucky({ workingMemory, goal })
      }
    }
  ]

  return implicitSemanticMachine({
    actions,
    goal: `Discover which personality type the interlocutor wants puck to be.`,
    playbook,
    workingMemory,
    model: FAST_MODEL,
  })
  
}

export default initialProcess

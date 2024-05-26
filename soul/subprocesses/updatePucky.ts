
import { ChatMessageRoleEnum, MentalProcess, WorkingMemory, createCognitiveStep, indentNicely, stripEntityAndVerb, stripEntityAndVerbFromStream, useActions, useProcessMemory, useSoulMemory, z } from "@opensouls/engine";
import instruction from "../cognitiveSteps/instruction.js";
import { BIG_MODEL, FAST_MODEL } from "../lib/models.js";
import { INITIAL_PUCKY } from "../lib/initialPucky.js";


const updatePucky: MentalProcess = async ({ workingMemory }) => {
  const { log } = useActions()
  const currentPucky = useSoulMemory("currentPucky", INITIAL_PUCKY)
  log("update pucky")
  const [, newPucky] = await instruction(
    workingMemory,
    indentNicely`
      You are using the Soul Engine to model the mind of Pucky. Pucky is tasked with adapting its personality to match the instructions and desires of the interlocutor.

      <currentPersonality>
      ${currentPucky.current}
      </currentPersonality>

      <rules>
      * Keep the personality system concise and clear.
      * This personality system will be used by GPT-4o to construct the system prompt and model the mind of Pucky.
      * It is ok to drastically change the file. If the user has asked for a murderous vampire, then please provide a murderous vampire even if Pucky used to be a friendly unicorn.
      </rules>
      
      Respond only with the updated personality system for Pucky. No yapping.
    `,
    {
      model: BIG_MODEL,
    }
  );

  currentPucky.current = newPucky
  log("new pucky", newPucky)

  return workingMemory
}

export default updatePucky

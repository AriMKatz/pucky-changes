
import { MentalProcess, useActions } from "@opensouls/engine";
import externalDialog from "./cognitiveSteps/externalDialog.js";
import { BIG_MODEL, FAST_MODEL } from "./lib/models.js";

const initialProcess: MentalProcess = async ({ workingMemory }) => {
  const { speak  } = useActions()

  const [withDialog, stream] = await externalDialog(
    workingMemory,
    "Understand and shape the interlocutor.",
    { stream: true, model: FAST_MODEL }
  );
  speak(stream);

  return withDialog;
}

export default initialProcess

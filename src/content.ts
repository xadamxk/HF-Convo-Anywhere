import { ConvoAnywhere } from "./ConvoAnywhere";
import { Logger } from "./core/Logger";

new ConvoAnywhere()
  .start()
  .catch((error) =>
    Logger.error(`Couldn't start Convo Anywhere: ${error?.message}`, error)
  );

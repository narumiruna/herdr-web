import { join } from "node:path";
import { PushNotificationService } from "../server/push-notifications";
import { ViewerShareStore } from "../server/share-store";
import { TerminalTicketStore } from "../server/terminal-tickets";
import { WorkflowTemplateStore } from "../server/workflow-template-store";

export async function httpStores(directory: string) {
  const pushNotifications = new PushNotificationService(
    join(directory, "push.json"),
  );
  const shareStore = new ViewerShareStore(join(directory, "shares.json"));
  await pushNotifications.load();
  await shareStore.load();
  return {
    pushNotifications,
    shareStore,
    terminalTickets: new TerminalTicketStore(),
    workflowTemplates: new WorkflowTemplateStore(
      join(directory, "workflows.json"),
    ),
  };
}

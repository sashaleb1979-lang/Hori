import { inboundMessagesCounter } from "@hori/shared";

export function trackIngestedMessage() {
  inboundMessagesCounter.inc();
}


import { bootstrapBot } from "./bootstrap";

bootstrapBot().catch((error) => {
  console.error(error);
  process.exit(1);
});

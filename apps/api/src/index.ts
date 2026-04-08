import { bootstrapApi } from "./bootstrap";

async function main() {
  const app = await bootstrapApi();

  await app.listen({
    host: app.runtime.env.API_HOST,
    port: app.runtime.env.API_PORT
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

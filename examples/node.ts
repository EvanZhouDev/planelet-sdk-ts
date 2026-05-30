import { createPlugin, defineAction } from "../src/index.js";
import { createNodeServer } from "../src/node.js";

const plugin = createPlugin({
  id: "node-example",
  label: "Node Example Plugin",
  actions: [
    defineAction({
      id: "echo",
      label: "Echo",
      parameters: [{ id: "message", label: "Message", type: "string", required: true }],
      execute: async ({ parameters }) => ({
        success: true,
        data: {
          message: parameters.message,
        },
      }),
    }),
  ],
  triggers: [],
});

const port = Number(process.env.PORT ?? 3000);
const server = createNodeServer(plugin);

server.listen(port, "127.0.0.1", () => {
  console.log(`Planelet plugin listening on http://127.0.0.1:${port}`);
});

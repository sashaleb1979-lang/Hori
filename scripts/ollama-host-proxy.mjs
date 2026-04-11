import http from "node:http";

const listenHost = process.env.HORI_PROXY_HOST || "127.0.0.1";
const listenPort = Number.parseInt(process.env.HORI_PROXY_PORT || "11435", 10);
const targetHost = process.env.HORI_OLLAMA_HOST || "127.0.0.1";
const targetPort = Number.parseInt(process.env.HORI_OLLAMA_PORT || "11434", 10);
const targetHostHeader = `${targetHost}:${targetPort}`;

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function sanitizeHeaders(headers) {
  const result = { ...headers };
  for (const header of hopByHopHeaders) {
    delete result[header];
  }
  return result;
}

const server = http.createServer((clientRequest, clientResponse) => {
  const headers = sanitizeHeaders(clientRequest.headers);
  headers.host = targetHostHeader;

  const proxyRequest = http.request(
    {
      hostname: targetHost,
      port: targetPort,
      method: clientRequest.method,
      path: clientRequest.url,
      headers,
    },
    (proxyResponse) => {
      clientResponse.writeHead(
        proxyResponse.statusCode || 502,
        proxyResponse.statusMessage,
        sanitizeHeaders(proxyResponse.headers),
      );
      proxyResponse.pipe(clientResponse);
    },
  );

  proxyRequest.on("error", (error) => {
    if (!clientResponse.headersSent) {
      clientResponse.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    }
    clientResponse.end(JSON.stringify({ error: `ollama proxy error: ${error.message}` }));
  });

  clientRequest.on("aborted", () => {
    proxyRequest.destroy();
  });

  clientRequest.pipe(proxyRequest);
});

server.listen(listenPort, listenHost, () => {
  console.log(`hori ollama proxy listening on http://${listenHost}:${listenPort}`);
  console.log(`forwarding to http://${targetHostHeader} with Host: ${targetHostHeader}`);
});

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

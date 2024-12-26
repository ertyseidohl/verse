import { createConnection, ProposedFeatures } from "vscode-languageserver/node";

import VerseServer from "./VerseServer";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection: ProposedFeatures.Connection = createConnection(
  ProposedFeatures.all
);

async function startServer() {
  await VerseServer.create(connection);
  connection.listen();
}

(async () => await startServer())();

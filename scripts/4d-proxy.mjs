import net from 'net';

const REAL_SERVER = '192.168.77.10';
const REAL_SQL_PORT = 19822;
const LISTEN_PORT = 19812;
const LISTEN_HOST = '127.0.0.1';

const server = net.createServer(client => {
  const remote = net.createConnection(REAL_SQL_PORT, REAL_SERVER);
  client.pipe(remote);
  remote.pipe(client);
  remote.on('error', () => client.destroy());
  client.on('error', () => remote.destroy());
  console.log(`[proxy] new connection → ${REAL_SERVER}:${REAL_SQL_PORT}`);
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`[proxy] listening on 127.0.0.1:${LISTEN_PORT} → ${REAL_SERVER}:${REAL_SQL_PORT}`);
});

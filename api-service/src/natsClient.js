import { StringCodec, connect } from 'nats';

const codec = StringCodec();

export async function connectNats(url) {
  const connection = await connect({ servers: url });

  return {
    publish(subject, payload) {
      connection.publish(subject, codec.encode(JSON.stringify(payload)));
    },
    subscribe(subject) {
      return connection.subscribe(subject);
    },
    decode(message) {
      return JSON.parse(codec.decode(message.data));
    },
    async close() {
      await connection.drain();
    },
  };
}

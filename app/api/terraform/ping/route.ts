import { NextRequest, NextResponse } from 'next/server';
import net from 'net';

export async function GET(request: NextRequest) {
  const ip = request.nextUrl.searchParams.get('ip');

  if (!ip) {
    return NextResponse.json({ error: 'Missing ip' }, { status: 400 });
  }

  const checkPort80 = () => {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let connected = false;

      socket.setTimeout(2000);

      socket.on('connect', () => {
        connected = true;
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        resolve(false);
      });

      socket.connect(80, ip);
    });
  };

  const isOnline = await checkPort80();
  return NextResponse.json({ ip, online: isOnline });
}

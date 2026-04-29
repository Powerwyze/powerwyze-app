export default async function handler(req: any, res: any) {
  res.status(200).json({ 
    ok: true, 
    supabaseUrl: process.env.SUPABASE_URL ? 'SET' : 'MISSING',
    supabaseKey: process.env.SUPABASE_ANON_KEY ? 'SET' : 'MISSING',
    nodeVersion: process.version,
    time: new Date().toISOString()
  });
}

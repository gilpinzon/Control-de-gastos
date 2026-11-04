const { sql, ensureTables } = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    await ensureTables();
    const [result] = await sql`SELECT NOW() as now, current_database() as db`;
    return res.status(200).json({
      ok: true,
      provider: 'Neon PostgreSQL',
      timestamp: result.now,
      database: result.db
    });
  } catch (err) {
    console.error('Status check error:', err);
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};


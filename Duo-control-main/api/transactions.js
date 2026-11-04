const { sql, WORKSPACE_ID, ensureTables } = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    await ensureTables();

    // GET /api/transactions
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT 
          id::text as id,
          type,
          amount::float as amount,
          category,
          coalesce(description, '') as description,
          to_char(date, 'YYYY-MM-DD') as date,
          recorded_by as "paidBy",
          created_at as "createdAt"
        FROM transactions
        WHERE workspace_id = ${WORKSPACE_ID}
        ORDER BY date DESC, created_at DESC
      `;
      return res.status(200).json({ success: true, transactions: rows });
    }

    // POST /api/transactions
    if (req.method === 'POST') {
      const { id, type, amount, category, description, date, paidBy } = req.body || {};

      if (!type || !amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ success: false, error: 'Monto y tipo inválidos' });
      }

      const txDate = date || new Date().toISOString().split('T')[0];
      const txCategory = category || 'Otros';
      const txDesc = description || '';
      const txRecorder = paidBy || 'Gil';
      const parsedAmount = parseFloat(amount);
      const isUUID = id && /^[0-9a-fA-F-]{36}$/.test(id);

      let row;
      if (isUUID) {
        [row] = await sql`
          INSERT INTO transactions (id, workspace_id, type, amount, category, description, date, recorded_by)
          VALUES (${id}, ${WORKSPACE_ID}, ${type}, ${parsedAmount}, ${txCategory}, ${txDesc}, ${txDate}, ${txRecorder})
          RETURNING 
            id::text as id,
            type,
            amount::float as amount,
            category,
            description,
            to_char(date, 'YYYY-MM-DD') as date,
            recorded_by as "paidBy",
            created_at as "createdAt"
        `;
      } else {
        [row] = await sql`
          INSERT INTO transactions (workspace_id, type, amount, category, description, date, recorded_by)
          VALUES (${WORKSPACE_ID}, ${type}, ${parsedAmount}, ${txCategory}, ${txDesc}, ${txDate}, ${txRecorder})
          RETURNING 
            id::text as id,
            type,
            amount::float as amount,
            category,
            description,
            to_char(date, 'YYYY-MM-DD') as date,
            recorded_by as "paidBy",
            created_at as "createdAt"
        `;
      }

      return res.status(201).json({ success: true, transaction: row });
    }

    // DELETE /api/transactions?id=...
    if (req.method === 'DELETE') {
      const { id } = req.query || {};
      if (!id) {
        return res.status(400).json({ success: false, error: 'ID requerido' });
      }

      await sql`
        DELETE FROM transactions
        WHERE id::text = ${id} AND workspace_id = ${WORKSPACE_ID}
      `;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('Transactions error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};


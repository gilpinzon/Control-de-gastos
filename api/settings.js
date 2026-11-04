const { sql, WORKSPACE_ID, ensureTables } = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    await ensureTables();

    if (req.method === 'POST') {
      const { monthlySavingsGoal, currency, symbol, name1, name2, email1, email2 } = req.body || {};

      await sql`
        UPDATE workspaces
        SET 
          monthly_savings_goal = coalesce(${monthlySavingsGoal !== undefined ? parseFloat(monthlySavingsGoal) : null}, monthly_savings_goal),
          currency_code = coalesce(${currency || null}, currency_code),
          currency_symbol = coalesce(${symbol || null}, currency_symbol),
          authorized_email_1 = coalesce(${email1 || null}, authorized_email_1),
          authorized_email_2 = coalesce(${email2 || null}, authorized_email_2),
          name = coalesce(${name1 ? 'Hogar ' + name1 + ' & ' + (name2 || 'Ale') : null}, name)
        WHERE id = ${WORKSPACE_ID}
      `;

      return res.status(200).json({ success: true });
    }

    const [ws] = await sql`
      SELECT 
        name,
        currency_code as currency,
        currency_symbol as symbol,
        monthly_savings_goal::float as "monthlySavingsGoal",
        authorized_email_1 as "email1",
        authorized_email_2 as "email2"
      FROM workspaces
      WHERE id = ${WORKSPACE_ID}
    `;

    return res.status(200).json({ success: true, workspace: ws });
  } catch (err) {
    console.error('Settings error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};


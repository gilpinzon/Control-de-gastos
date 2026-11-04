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

    // POST: Sincronizar / Subir datos locales a Neon
    if (req.method === 'POST') {
      const { transactions = [], shoppingList = [], couple = {} } = req.body || {};

      if (Array.isArray(transactions) && transactions.length > 0) {
        for (const tx of transactions) {
          const isUUID = tx.id && /^[0-9a-fA-F-]{36}$/.test(tx.id);
          const txDate = tx.date || new Date().toISOString().split('T')[0];
          const txCat = tx.category || 'Otros';
          const txDesc = tx.description || '';
          const txBy = tx.paidBy || 'Gil';
          const txAmount = parseFloat(tx.amount) || 0;

          if (txAmount > 0) {
            if (isUUID) {
              await sql`
                INSERT INTO transactions (id, workspace_id, type, amount, category, description, date, recorded_by)
                VALUES (${tx.id}, ${WORKSPACE_ID}, ${tx.type}, ${txAmount}, ${txCat}, ${txDesc}, ${txDate}, ${txBy})
                ON CONFLICT (id) DO NOTHING
              `;
            } else {
              await sql`
                INSERT INTO transactions (workspace_id, type, amount, category, description, date, recorded_by)
                VALUES (${WORKSPACE_ID}, ${tx.type}, ${txAmount}, ${txCat}, ${txDesc}, ${txDate}, ${txBy})
              `;
            }
          }
        }
      }

      if (Array.isArray(shoppingList) && shoppingList.length > 0) {
        for (const item of shoppingList) {
          const isUUID = item.id && /^[0-9a-fA-F-]{36}$/.test(item.id);
          const itemName = item.name ? item.name.trim() : '';
          const itemCat = item.category || 'Mercado / Supermercado';
          const itemQty = item.quantity || '1';
          const itemPurchased = !!item.isPurchased;
          const itemBy = item.addedBy || 'Gil';

          if (itemName) {
            if (isUUID) {
              await sql`
                INSERT INTO shopping_items (id, workspace_id, name, category, quantity, is_purchased, added_by)
                VALUES (${item.id}, ${WORKSPACE_ID}, ${itemName}, ${itemCat}, ${itemQty}, ${itemPurchased}, ${itemBy})
                ON CONFLICT (id) DO NOTHING
              `;
            } else {
              await sql`
                INSERT INTO shopping_items (workspace_id, name, category, quantity, is_purchased, added_by)
                VALUES (${WORKSPACE_ID}, ${itemName}, ${itemCat}, ${itemQty}, ${itemPurchased}, ${itemBy})
              `;
            }
          }
        }
      }

      if (couple.monthlySavingsGoal !== undefined) {
        await sql`
          UPDATE workspaces
          SET monthly_savings_goal = ${parseFloat(couple.monthlySavingsGoal) || 0}
          WHERE id = ${WORKSPACE_ID}
        `;
      }
    }

    // Retorna la instantánea completa desde Neon
    const transactions = await sql`
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

    const shoppingList = await sql`
      SELECT 
        id::text as id,
        name,
        category,
        quantity,
        is_purchased as "isPurchased",
        added_by as "addedBy",
        coalesce(purchased_by, '') as "purchasedBy",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM shopping_items
      WHERE workspace_id = ${WORKSPACE_ID}
      ORDER BY created_at DESC
    `;

    const [ws] = await sql`
      SELECT 
        name,
        currency_code as currency,
        currency_symbol as symbol,
        monthly_savings_goal::float as "monthlySavingsGoal"
      FROM workspaces
      WHERE id = ${WORKSPACE_ID}
    `;

    return res.status(200).json({
      success: true,
      transactions,
      shoppingList,
      workspace: ws || {
        name: 'Hogar Gil & Ale',
        currency: 'COP',
        symbol: '$',
        monthlySavingsGoal: 0
      }
    });
  } catch (err) {
    console.error('Sync error:', err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};


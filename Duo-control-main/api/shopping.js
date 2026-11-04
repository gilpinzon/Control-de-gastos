const { sql, WORKSPACE_ID, ensureTables } = require('../lib/db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    await ensureTables();

    // GET /api/shopping
    if (req.method === 'GET') {
      const items = await sql`
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
      return res.status(200).json({ success: true, items });
    }

    // POST /api/shopping
    if (req.method === 'POST') {
      const { id, name, category, quantity, isPurchased, addedBy } = req.body || {};
      if (!name) {
        return res.status(400).json({ success: false, error: 'Nombre de producto requerido' });
      }

      const itemName = name.trim();
      const itemCat = category || 'Mercado / Supermercado';
      const itemQty = quantity || '1';
      const itemPurchased = !!isPurchased;
      const itemAdded = addedBy || 'Gil';
      const isUUID = id && /^[0-9a-fA-F-]{36}$/.test(id);

      let row;
      if (isUUID) {
        [row] = await sql`
          INSERT INTO shopping_items (id, workspace_id, name, category, quantity, is_purchased, added_by)
          VALUES (${id}, ${WORKSPACE_ID}, ${itemName}, ${itemCat}, ${itemQty}, ${itemPurchased}, ${itemAdded})
          RETURNING 
            id::text as id,
            name,
            category,
            quantity,
            is_purchased as "isPurchased",
            added_by as "addedBy",
            created_at as "createdAt"
        `;
      } else {
        [row] = await sql`
          INSERT INTO shopping_items (workspace_id, name, category, quantity, is_purchased, added_by)
          VALUES (${WORKSPACE_ID}, ${itemName}, ${itemCat}, ${itemQty}, ${itemPurchased}, ${itemAdded})
          RETURNING 
            id::text as id,
            name,
            category,
            quantity,
            is_purchased as "isPurchased",
            added_by as "addedBy",
            created_at as "createdAt"
        `;
      }

      return res.status(201).json({ success: true, item: row });
    }

    // PATCH /api/shopping
    if (req.method === 'PATCH') {
      const { uncheckAll } = req.query || {};
      if (uncheckAll === 'true') {
        await sql`
          UPDATE shopping_items
          SET is_purchased = false, updated_at = timezone('utc'::text, now())
          WHERE workspace_id = ${WORKSPACE_ID}
        `;
        return res.status(200).json({ success: true });
      }

      const { id, isPurchased, name } = req.body || {};
      if (!id) {
        return res.status(400).json({ success: false, error: 'ID requerido' });
      }

      if (isPurchased !== undefined) {
        await sql`
          UPDATE shopping_items
          SET is_purchased = ${isPurchased}, updated_at = timezone('utc'::text, now())
          WHERE id::text = ${id} AND workspace_id = ${WORKSPACE_ID}
        `;
      }

      if (name) {
        await sql`
          UPDATE shopping_items
          SET name = ${name}, updated_at = timezone('utc'::text, now())
          WHERE id::text = ${id} AND workspace_id = ${WORKSPACE_ID}
        `;
      }

      return res.status(200).json({ success: true });
    }

    // DELETE /api/shopping?id=... OR ?allCompleted=true
    if (req.method === 'DELETE') {
      const { id, allCompleted } = req.query || {};

      if (allCompleted === 'true') {
        await sql`
          DELETE FROM shopping_items
          WHERE workspace_id = ${WORKSPACE_ID} AND is_purchased = true
        `;
        return res.status(200).json({ success: true });
      }

      if (!id) {
        return res.status(400).json({ success: false, error: 'ID requerido' });
      }

      await sql`
        DELETE FROM shopping_items
        WHERE id::text = ${id} AND workspace_id = ${WORKSPACE_ID}
      `;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('Shopping error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};


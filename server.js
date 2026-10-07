const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.get('/test', (req, res) => {
    res.send('SERVER IS WORKING');
});
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || '',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
};

let pool = null;

function createPool(config) {
  if (pool) {
    try {
      pool.end();
    } catch (e) {
      console.error('Error closing old pool:', e);
    }
  }
  pool = mysql.createPool(config);
}

// Initialize pool if database name is provided
if (dbConfig.database) {
  createPool(dbConfig);
}

// Helper to escape identifiers (table and column names)
function escapeId(identifier) {
  return '`' + String(identifier).replace(/`/g, '``') + '`';
}

// Test / Connect route
app.post('/api/connect', async (req, res) => {
  const { host, port, user, password, database } = req.body;
  const testConfig = {
    host: host || 'localhost',
    port: parseInt(port, 10) || 3306,
    user: user || 'root',
    password: password || '',
    database: database || undefined,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true
  };

  try {
    const tempPool = mysql.createPool(testConfig);
    const conn = await tempPool.getConnection();
    let databasesList = [];

    // If no database selected, fetch available databases
    if (!database) {
      const [dbs] = await conn.query("SHOW DATABASES WHERE `Database` NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')");
      databasesList = dbs.map(d => Object.values(d)[0]);
    }

    conn.release();

    // Success! Update active config and pool
    dbConfig = { ...testConfig, database: database || '' };
    pool = tempPool;

    // Update .env file
    const envContent = `PORT=${PORT}\nDB_HOST=${dbConfig.host}\nDB_PORT=${dbConfig.port}\nDB_USER=${dbConfig.user}\nDB_PASSWORD=${dbConfig.password}\nDB_NAME=${dbConfig.database}\n`;
    fs.writeFileSync(path.join(__dirname, '.env'), envContent, 'utf8');

    res.json({
      success: true,
      message: database ? `Connected successfully to database "${database}"!` : 'Connected to MySQL server! Please select a database.',
      databases: databasesList,
      currentConfig: {
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        database: dbConfig.database
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
      code: err.code
    });
  }
});

// Status route
app.get('/api/status', async (req, res) => {
  if (!pool || !dbConfig.database) {
    return res.json({
      connected: false,
      message: 'Not connected to a database',
      config: {
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        database: dbConfig.database
      }
    });
  }

  try {
    const conn = await pool.getConnection();
    conn.release();
    res.json({
      connected: true,
      message: `Connected to ${dbConfig.database} on ${dbConfig.host}:${dbConfig.port}`,
      config: {
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        database: dbConfig.database
      }
    });
  } catch (err) {
    res.json({
      connected: false,
      message: err.message,
      config: {
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        database: dbConfig.database
      }
    });
  }
});

// Middleware to ensure DB connection is ready
function requireDb(req, res, next) {
  if (!pool || !dbConfig.database) {
    return res.status(400).json({
      error: 'Database not connected. Please connect via Settings first.'
    });
  }
  next();
}

// List all tables
app.get('/api/tables', requireDb, async (req, res) => {
  try {
    const [rows] = await pool.query('SHOW TABLES');
    const tables = [];

    for (const r of rows) {
      const tableName = Object.values(r)[0];
      try {
        const [countResult] = await pool.query(`SELECT COUNT(*) as cnt FROM ${escapeId(tableName)}`);
        tables.push({
          name: tableName,
          rowCount: countResult[0].cnt
        });
      } catch (e) {
        tables.push({
          name: tableName,
          rowCount: 0
        });
      }
    }

    res.json({ tables });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get table schema (columns, types, keys)
app.get('/api/tables/:table/schema', requireDb, async (req, res) => {
  const { table } = req.params;
  try {
    const [columns] = await pool.query(`
      SELECT 
        COLUMN_NAME AS name,
        DATA_TYPE AS type,
        COLUMN_TYPE AS fullType,
        IS_NULLABLE AS isNullable,
        COLUMN_KEY AS columnKey,
        COLUMN_DEFAULT AS defaultValue,
        EXTRA AS extra,
        COLUMN_COMMENT AS comment
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `, [dbConfig.database, table]);

    const primaryKeys = columns.filter(c => c.columnKey === 'PRI').map(c => c.name);

    // Enrich schema with readable joined columns
    if (table === 'candidate') {
      columns.push({
        name: 'skills',
        type: 'varchar',
        fullType: 'text',
        isNullable: 'YES',
        columnKey: '',
        defaultValue: null,
        extra: '',
        comment: 'Assigned Skills',
        isVirtual: true
      });
    } else if (table === 'candidate_skill') {
      columns.splice(1, 0, {
        name: 'candidate_name',
        type: 'varchar',
        fullType: 'varchar(100)',
        isNullable: 'YES',
        columnKey: '',
        defaultValue: null,
        extra: '',
        comment: 'Candidate Name',
        isVirtual: true
      });
      columns.push({
        name: 'skill_name',
        type: 'varchar',
        fullType: 'varchar(100)',
        isNullable: 'YES',
        columnKey: '',
        defaultValue: null,
        extra: '',
        comment: 'Skill Name',
        isVirtual: true
      });
    } else if (table === 'application') {
      columns.splice(1, 0, {
        name: 'candidate_name',
        type: 'varchar',
        fullType: 'varchar(100)',
        isNullable: 'YES',
        columnKey: '',
        defaultValue: null,
        extra: '',
        comment: 'Candidate Name',
        isVirtual: true
      });
      columns.splice(2, 0, {
        name: 'vacancy_title',
        type: 'varchar',
        fullType: 'varchar(100)',
        isNullable: 'YES',
        columnKey: '',
        defaultValue: null,
        extra: '',
        comment: 'Job Vacancy',
        isVirtual: true
      });
    }

    res.json({
      table,
      columns,
      primaryKeys
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get table data with pagination, sorting & search
app.get('/api/tables/:table/data', requireDb, async (req, res) => {
  const { table } = req.params;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const search = (req.query.search || '').trim();
  const sortBy = req.query.sortBy;
  const sortOrder = req.query.sortOrder === 'DESC' ? 'DESC' : 'ASC';

  try {
    // Get columns to validate search and sort
    const [cols] = await pool.query(
      'SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
      [dbConfig.database, table]
    );

    const validColNames = cols.map(c => c.COLUMN_NAME);

    let whereClause = '';
    const params = [];

    if (search && validColNames.length > 0) {
      const searchConditions = validColNames.map(col => `${escapeId(table)}.${escapeId(col)} LIKE ?`).join(' OR ');
      whereClause = ` WHERE (${searchConditions})`;
      for (let i = 0; i < validColNames.length; i++) {
        params.push(`%${search}%`);
      }
    }

    // Total count
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM ${escapeId(table)}${whereClause}`,
      params
    );
    const totalRecords = countRows[0].total;

    // Build SELECT query with relational joins for richer UX
    let selectFields = `${escapeId(table)}.*`;
    let joinClause = '';
    let groupClause = '';

    if (table === 'candidate') {
      selectFields = `${escapeId(table)}.*, GROUP_CONCAT(DISTINCT \`skill\`.\`skill_name\` SEPARATOR ', ') AS skills`;
      joinClause = ` LEFT JOIN \`candidate_skill\` ON \`${table}\`.\`candidate_id\` = \`candidate_skill\`.\`candidate_id\` LEFT JOIN \`skill\` ON \`candidate_skill\`.\`skill_id\` = \`skill\`.\`skill_id\``;
      groupClause = ` GROUP BY \`${table}\`.\`candidate_id\``;
    } else if (table === 'candidate_skill') {
      selectFields = `${escapeId(table)}.*, \`candidate\`.\`name\` AS candidate_name, \`skill\`.\`skill_name\` AS skill_name`;
      joinClause = ` LEFT JOIN \`candidate\` ON \`${table}\`.\`candidate_id\` = \`candidate\`.\`candidate_id\` LEFT JOIN \`skill\` ON \`${table}\`.\`skill_id\` = \`skill\`.\`skill_id\``;
    } else if (table === 'application') {
      selectFields = `${escapeId(table)}.*, \`candidate\`.\`name\` AS candidate_name, \`vacancy\`.\`title\` AS vacancy_title`;
      joinClause = ` LEFT JOIN \`candidate\` ON \`${table}\`.\`candidate_id\` = \`candidate\`.\`candidate_id\` LEFT JOIN \`vacancy\` ON \`${table}\`.\`vacancy_id\` = \`vacancy\`.\`vacancy_id\``;
    }

    let orderByClause = '';
    if (sortBy && validColNames.includes(sortBy)) {
      orderByClause = ` ORDER BY ${escapeId(table)}.${escapeId(sortBy)} ${sortOrder}`;
    }

    const query = `SELECT ${selectFields} FROM ${escapeId(table)}${joinClause}${whereClause}${groupClause}${orderByClause} LIMIT ? OFFSET ?`;
    const [rows] = await pool.query(query, [...params, limit, offset]);

    res.json({
      table,
      records: rows,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit) || 1
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Insert a record
app.post('/api/tables/:table/data', requireDb, async (req, res) => {
  const { table } = req.params;
  const record = req.body;

  try {
    const [cols] = await pool.query(
      'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
      [dbConfig.database, table]
    );
    const validColNames = new Set(cols.map(c => c.COLUMN_NAME));

    const keys = Object.keys(record).filter(k => validColNames.has(k));
    if (keys.length === 0) {
      return res.status(400).json({ error: 'No valid data provided' });
    }

    const columnsEscaped = keys.map(escapeId).join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map(k => record[k] === '' ? null : record[k]);

    const sql = `INSERT INTO ${escapeId(table)} (${columnsEscaped}) VALUES (${placeholders})`;
    const [result] = await pool.query(sql, values);

    res.json({
      success: true,
      message: 'Record created successfully',
      insertId: result.insertId,
      affectedRows: result.affectedRows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a record
app.put('/api/tables/:table/data', requireDb, async (req, res) => {
  const { table } = req.params;
  const { where, data } = req.body;

  if (!where || Object.keys(where).length === 0) {
    return res.status(400).json({ error: 'Primary key / identifying condition required to update' });
  }

  if (!data || Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'No data provided to update' });
  }

  try {
    const [cols] = await pool.query(
      'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
      [dbConfig.database, table]
    );
    const validColNames = new Set(cols.map(c => c.COLUMN_NAME));

    const setClauses = [];
    const values = [];

    for (const [col, val] of Object.entries(data)) {
      if (validColNames.has(col)) {
        setClauses.push(`${escapeId(col)} = ?`);
        values.push(val === '' ? null : val);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid columns provided to update' });
    }

    const whereClauses = [];
    for (const [col, val] of Object.entries(where)) {
      whereClauses.push(`${escapeId(col)} = ?`);
      values.push(val);
    }

    const sql = `UPDATE ${escapeId(table)} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
    const [result] = await pool.query(sql, values);

    res.json({
      success: true,
      message: 'Record updated successfully',
      affectedRows: result.affectedRows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a record
app.delete('/api/tables/:table/data', requireDb, async (req, res) => {
  const { table } = req.params;
  const { where } = req.body;

  if (!where || Object.keys(where).length === 0) {
    return res.status(400).json({ error: 'Primary key / identifying condition required to delete' });
  }

  try {
    const whereClauses = [];
    const values = [];

    for (const [col, val] of Object.entries(where)) {
      whereClauses.push(`${escapeId(col)} = ?`);
      values.push(val);
    }

    const sql = `DELETE FROM ${escapeId(table)} WHERE ${whereClauses.join(' AND ')}`;
    const [result] = await pool.query(sql, values);

    res.json({
      success: true,
      message: 'Record deleted successfully',
      affectedRows: result.affectedRows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Run raw SQL query
app.post('/api/query', requireDb, async (req, res) => {
  const { sql } = req.body;
  if (!sql || !sql.trim()) {
    return res.status(400).json({ error: 'SQL query cannot be empty' });
  }

  const startTime = Date.now();
  try {
    const [results, fields] = await pool.query(sql);
    const duration = Date.now() - startTime;

    if (Array.isArray(results)) {
      res.json({
        success: true,
        type: 'select',
        duration,
        rowCount: results.length,
        rows: results,
        columns: fields ? fields.map(f => f.name) : []
      });
    } else {
      res.json({
        success: true,
        type: 'mutation',
        duration,
        affectedRows: results.affectedRows,
        insertId: results.insertId,
        message: results.message
      });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Get vacancies and skills metadata for application form
app.get('/api/candidate-form-metadata', requireDb, async (req, res) => {
  try {
    let vacancies = [];
    let skills = [];

    try {
      const [vRows] = await pool.query('SELECT vacancy_id, title FROM vacancy ORDER BY title');
      vacancies = vRows;
    } catch (e) {
      // vacancy table might not exist
    }

    try {
      const [sRows] = await pool.query('SELECT skill_id, skill_name, category FROM skill ORDER BY skill_name');
      skills = sRows;
    } catch (e) {
      // skill table might not exist
    }

    res.json({ vacancies, skills });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Candidate and linked Application in a single transaction
app.post('/api/candidate-application', requireDb, async (req, res) => {
  const { candidate, application, skills } = req.body;

  if (!candidate || !candidate.name) {
    return res.status(400).json({ error: 'Candidate name is required' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Insert Candidate
    const [candResult] = await conn.query(
      `INSERT INTO candidate (name, email, phone, date_of_birth, address, gender, resume_path) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        candidate.name,
        candidate.email || null,
        candidate.phone || null,
        candidate.date_of_birth || null,
        candidate.address || null,
        candidate.gender || null,
        candidate.resume_path || null
      ]
    );

    const candidateId = candResult.insertId;

    // 2. Insert Application
    let applicationId = null;
    if (application && application.vacancy_id) {
      const appliedOn = application.applied_on || new Date().toISOString().split('T')[0];
      const status = application.status || 'Applied';
      const resumePath = application.resume_path || candidate.resume_path || null;
      const coverLetter = application.cover_letter || null;

      const [appResult] = await conn.query(
        `INSERT INTO application (applied_on, status, cover_letter, resume_path, vacancy_id, candidate_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [appliedOn, status, coverLetter, resumePath, application.vacancy_id, candidateId]
      );
      applicationId = appResult.insertId;
    }

    // 3. Insert Skills if selected
    if (Array.isArray(skills) && skills.length > 0) {
      for (const skillId of skills) {
        try {
          await conn.query(
            `INSERT INTO candidate_skill (candidate_id, skill_id, proficiency_level) VALUES (?, ?, ?)`,
            [candidateId, skillId, 'Intermediate']
          );
        } catch (skillErr) {
          console.warn('Skill insert ignored:', skillErr.message);
        }
      }
    }

    await conn.commit();

    res.json({
      success: true,
      candidateId,
      applicationId,
      message: applicationId
        ? `Successfully registered Candidate #${candidateId} with Application #${applicationId}!`
        : `Successfully registered Candidate #${candidateId}!`
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});


app.get('/api/candidates/:id', async (req, res) => {
    try {
        const candidateId = req.params.id;

        // Get candidate details
        const [candidateRows] = await db.query(
            `SELECT 
                candidate_id,
                name,
                email,
                phone,
                date_of_birth,
                address,
                gender,
                resume_path
             FROM Candidate
             WHERE candidate_id = ?`,
            [candidateId]
        );

        if (candidateRows.length === 0) {
            return res.status(404).json({
                error: 'Candidate not found'
            });
        }

        // Get candidate's skills
        const [skillRows] = await db.query(
            `SELECT 
                s.skill_id,
                s.skill_name,
                s.category,
                cs.proficiency_level
             FROM Candidate_Skill cs
             JOIN Skill s ON cs.skill_id = s.skill_id
             WHERE cs.candidate_id = ?`,
            [candidateId]
        );

        res.json({
            candidate: candidateRows[0],
            skills: skillRows
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: 'Failed to fetch candidate'
        });
    }
});
// Get all candidates
app.get('/api/candidates', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                candidate_id,
                name
            FROM Candidate
            ORDER BY candidate_id
        `);

        res.json(rows);

    } catch (error) {
        console.error('Error fetching candidates:', error);

        res.status(500).json({
            error: 'Failed to fetch candidates'
        });
    }
});
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 MySQL Web Dashboard server running at:`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`===============================================`);
});
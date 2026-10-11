import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { connect } from '@tidbcloud/serverless';

async function check() {
  const conn = connect({
    host: process.env.TIDB_HOST,
    username: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE
  });

  const students = await conn.execute(`
    SELECT sp.*, u.full_name, u.email 
    FROM student_profiles sp 
    JOIN users u ON sp.user_id = u.id 
    WHERE u.full_name LIKE '%arwan%'
  `);
  console.log('Student:', JSON.stringify(students, null, 2));
}

check().catch(console.error);

// create_test_user.js
// Create a test user with password for auth testing
const bcrypt = require('bcryptjs');
const db = require('./config/database');

const TEST_USER = {
  email: 'neuropilotai@gmail.com',
  password: 'TestPassword123!',
  first_name: 'David',
  last_name: 'Mikulis',
  role: 'owner'
};

async function createTestUser() {
  try {
    const dbInstance = db.getConnection ? db : new db();
    const connection = dbInstance.getConnection ? dbInstance.getConnection() : dbInstance.db;

    // Check if user already exists
    await new Promise((resolve, reject) => {
      connection.get(
        'SELECT id, email FROM app_user WHERE email = ?',
        [TEST_USER.email],
        async (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          if (row) {
            console.log(`✅ User already exists: ${row.email} (${row.id})`);
            console.log('   Updating password...');

            // Update password
            const passwordHash = await bcrypt.hash(TEST_USER.password, 12);
            connection.run(
              'UPDATE app_user SET password_hash = ?, password_updated_at = datetime(\'now\') WHERE id = ?',
              [passwordHash, row.id],
              (updateErr) => {
                if (updateErr) {
                  reject(updateErr);
                } else {
                  console.log('✅ Password updated successfully');
                  console.log('');
                  console.log('Test credentials:');
                  console.log(`   Email: ${TEST_USER.email}`);
                  console.log(`   Password: ${TEST_USER.password}`);
                  resolve();
                }
              }
            );
          } else {
            // Create new user
            bcrypt.hash(TEST_USER.password, 12, (hashErr, passwordHash) => {
              if (hashErr) {
                reject(hashErr);
                return;
              }

              connection.run(
                `INSERT INTO app_user (email, password_hash, first_name, last_name, role, is_active)
                 VALUES (?, ?, ?, ?, ?, 1)`,
                [
                  TEST_USER.email,
                  passwordHash,
                  TEST_USER.first_name,
                  TEST_USER.last_name,
                  TEST_USER.role
                ],
                function(insertErr) {
                  if (insertErr) {
                    reject(insertErr);
                  } else {
                    console.log(`✅ Test user created successfully!`);
                    console.log(`   ID: ${this.lastID}`);
                    console.log(`   Email: ${TEST_USER.email}`);
                    console.log(`   Role: ${TEST_USER.role}`);
                    console.log('');
                    console.log('Test credentials:');
                    console.log(`   Email: ${TEST_USER.email}`);
                    console.log(`   Password: ${TEST_USER.password}`);
                    resolve();
                  }
                }
              );
            });
          }
        }
      );
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating test user:', error);
    process.exit(1);
  }
}

createTestUser();

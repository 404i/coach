#!/usr/bin/env node
/**
 * Re-authenticate with Garmin Connect
 * Updates the stored session in the database
 */

import fetch from 'node-fetch';
import readline from 'readline';

const API_BASE = process.env.API_BASE || 'http://localhost:8080';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

async function reauth() {
  console.log('🏃 Garmin Re-Authentication Tool\n');
  
  const email = await question('Garmin email: ');
  const password = await question('Garmin password: ');
  
  console.log('\n🔐 Attempting login...');
  
  try {
    const response = await fetch(`${API_BASE}/api/garmin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (data.mfa_required) {
      console.log('\n📱 MFA required!');
      const mfaCode = await question('Enter MFA code: ');
      
      const mfaResponse = await fetch(`${API_BASE}/api/garmin/mfa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, mfa_code: mfaCode })
      });
      
      const mfaData = await mfaResponse.json();
      
      if (mfaResponse.ok) {
        console.log('\n✅ Successfully authenticated!');
        console.log(`   Username: ${mfaData.username}`);
      } else {
        console.error('\n❌ MFA authentication failed:', mfaData.message);
        process.exit(1);
      }
    } else if (response.ok) {
      console.log('\n✅ Successfully authenticated!');
      console.log(`   Username: ${data.username}`);
    } else {
      console.error('\n❌ Authentication failed:', data.message);
      process.exit(1);
    }
    
    // Test sync
    console.log('\n🔄 Testing data sync...');
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const syncResponse = await fetch(`${API_BASE}/api/garmin/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email, 
        start_date: weekAgo,
        end_date: today
      })
    });
    
    const syncData = await syncResponse.json();
    
    if (syncResponse.ok) {
      console.log(`✅ Sync successful! Synced ${syncData.synced_days} days`);
      console.log('\n🎉 All done! Your Garmin authentication is now working.');
    } else {
      console.log('⚠️  Authentication worked but sync failed:', syncData.message);
      console.log('   You may need to check your Garmin data permissions.');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nMake sure the backend is running on', API_BASE);
    process.exit(1);
  } finally {
    rl.close();
  }
}

reauth();

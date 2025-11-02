import Retell from 'retell-sdk';

const client = new Retell({
  apiKey: process.env.RETELL_API_KEY,
});

async function checkBatch() {
  try {
    const batchCall = await client.batchCall.retrieve('batch_call_77a1c5354af444bfcda0e');
    console.log(JSON.stringify(batchCall, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkBatch();

import 'dotenv/config';
import { buildVoicePromptForLead } from './src/features/integrations/birth-voice/atlasProductPlaybook.ts';

async function run() {
  const targetNumber = "+5516982220000";
  const contactName = "Jhonatan";
  const companyName = "Nova Geração";
  
  console.log(`Gerando prompt para ${contactName} da ${companyName}...`);
  const prompt = buildVoicePromptForLead(companyName, contactName);
  
  const endpoint = 'https://api.bland.ai/v1/calls';
  const apiKey = process.env.BLAND_API_KEY;
  
  if (!apiKey) {
      console.error("BLAND_API_KEY não encontrada no .env!");
      return;
  }
  
  const requestBody = {
      phone_number: targetNumber,
      task: prompt,
      language: 'pt-BR',
      voice: 'nat',
      wait_for_greeting: true,
      record: true,
      max_duration: 15,
      request_data: {
          contact_name: contactName,
          company: companyName,
          agent_name: 'Gessica'
      }
  };

  console.log(`Disparando chamada para ${targetNumber} via Bland AI...`);
  
  const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
      },
      body: JSON.stringify(requestBody),
  });
  
  const result = await response.json();
  console.log(result);
}

run();

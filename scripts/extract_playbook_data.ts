import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { GoogleGenAI } from '@google/genai';

const DIR_PATH = 'C:/Users/Mah/Downloads/drive-download-20260728T153430Z-1-001';
const OUT_FILE = path.join(process.cwd(), 'scripts', 'extracted_playbook.json');

async function main() {
    console.log('Listing files in directory...');
    const files = fs.readdirSync(DIR_PATH).filter(f => f.endsWith('.docx'));
    
    const fileStats = files.map(file => {
        const fullPath = path.join(DIR_PATH, file);
        return { file, fullPath, size: fs.statSync(fullPath).size };
    });
    
    fileStats.sort((a, b) => b.size - a.size);
    const targetFiles = fileStats.slice(0, 5);
    
    console.log(`Processing top ${targetFiles.length} largest files...`);
    
    const allObjections: string[] = [];
    const allQualifications: string[] = [];
    
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    for (let i = 0; i < targetFiles.length; i++) {
        const { file, fullPath } = targetFiles[i];
        console.log(`[${i+1}/${targetFiles.length}] Reading ${file}...`);
        
        try {
            const result = await mammoth.extractRawText({ path: fullPath });
            let text = result.value;
            
            if (text.length > 50000) text = text.substring(0, 50000);
            if (text.trim().length < 500) {
                console.log(`   -> Skipping, text too short.`);
                continue;
            }
            
            console.log(`   -> Analyzing with AI...`);
            const prompt = `Analise a transcrição desta reunião de vendas B2B e extraia:
1) As principais objeções que o cliente levantou (ex: preço, já tem fornecedor, processo demorado, etc).
2) Os critérios de qualificação que o vendedor tentou descobrir (ex: volume de fretes mensais, nível de tecnologia usado, dor atual com a transportadora, etc).

Responda ESTRITAMENTE em formato JSON válido, sem markdown. O formato DEVE ser um objeto com duas arrays de strings, assim:
{"objections": ["obj1", "obj2"], "qualifications": ["qual1", "qual2"]}

Transcrição:
${text}`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { temperature: 0.2 }
            });
            
            try {
                let cleanedContent = response.text || '';
                cleanedContent = cleanedContent.replace(/```json/g, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(cleanedContent);
                
                if (Array.isArray(parsed.objections)) {
                    allObjections.push(...parsed.objections);
                }
                if (Array.isArray(parsed.qualifications)) {
                    allQualifications.push(...parsed.qualifications);
                }
                console.log(`   -> Extracted ${parsed.objections?.length || 0} objections and ${parsed.qualifications?.length || 0} qualifications.`);
            } catch (e) {
                console.error(`   -> Failed to parse AI response as JSON.`);
            }
        } catch (error) {
            console.error(`   -> Error processing file: ${error}`);
        }
    }
    
    const uniqueObjections = [...new Set(allObjections)];
    const uniqueQualifications = [...new Set(allQualifications)];
    
    const finalData = {
        objections: uniqueObjections,
        qualifications: uniqueQualifications
    };
    
    fs.writeFileSync(OUT_FILE, JSON.stringify(finalData, null, 2));
    console.log(`\nSuccess! Saved to ${OUT_FILE}`);
    console.log(`Total Objections: ${uniqueObjections.length}`);
    console.log(`Total Qualifications: ${uniqueQualifications.length}`);
}

main().catch(console.error);

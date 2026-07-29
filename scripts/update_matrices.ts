import fs from 'fs';
import path from 'path';

const playbookPath = path.join(process.cwd(), 'scripts', 'extracted_playbook.json');
const matricesPath = path.join(process.cwd(), 'src', 'features', 'chatbook', 'constants', 'brandMatrices.ts');

const data = JSON.parse(fs.readFileSync(playbookPath, 'utf-8'));

let matricesContent = fs.readFileSync(matricesPath, 'utf-8');

// Format the new data to match the expected interface structure roughly
const newObjections = data.objections.map((obj: string, i: number) => {
    return `  {
    id: 'transcribed-obj-${i}',
    brand: 'atlasgr',
    segment: 'Logística & Transportes',
    persona: 'Diretor de Logística',
    objectionTitle: 'Objeção Mapeada em Reunião',
    objectionText: ${JSON.stringify(obj)},
    responseScript: 'Entendo perfeitamente o seu lado. No entanto, analisando o cenário...',
    keyDifferentiator: 'Análise consultiva baseada em histórico.'
  }`;
});

const newQualifications = data.qualifications.map((qual: string, i: number) => {
    return `  {
    id: 'transcribed-qual-${i}',
    brand: 'atlasgr',
    segment: 'Logística & Transportes',
    persona: 'Diretor de Logística',
    framework: 'SPIN',
    questionCategory: 'Situação',
    questionText: ${JSON.stringify(qual)},
    idealAnswer: 'Resposta baseada nas operações do cliente.'
  }`;
});

const objectionsBlock = `\nexport const TRANSCRIBED_OBJECTIONS: ObjectionItem[] = [\n${newObjections.join(',\n')}\n];\n`;
const qualificationsBlock = `\nexport const TRANSCRIBED_QUALIFICATIONS: QualificationItem[] = [\n${newQualifications.join(',\n')}\n];\n`;

// Replace the exports at the bottom
matricesContent = matricesContent.replace(
    'export const BRAND_OBJECTIONS: ObjectionItem[] = generate100Objections();',
    `${objectionsBlock}\nexport const BRAND_OBJECTIONS: ObjectionItem[] = [...generate100Objections(), ...TRANSCRIBED_OBJECTIONS];`
);

matricesContent = matricesContent.replace(
    'export const BRAND_QUALIFICATIONS: QualificationItem[] = generate100Qualifications();',
    `${qualificationsBlock}\nexport const BRAND_QUALIFICATIONS: QualificationItem[] = [...generate100Qualifications(), ...TRANSCRIBED_QUALIFICATIONS];`
);

fs.writeFileSync(matricesPath, matricesContent);
console.log('Successfully updated brandMatrices.ts with transcribed data!');

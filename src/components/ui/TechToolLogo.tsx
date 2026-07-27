import React from 'react';

export interface TechToolInfo {
    name: string;
    category: 'Cloud' | 'CRM' | 'Frontend' | 'Backend' | 'Database' | 'DevOps' | 'Analytics' | 'Marketing' | 'E-commerce' | 'Outros';
    color: string;
    bgColor: string;
    borderColor: string;
    description: string;
}

// Mapeamento enriquecido de tecnologias para cores e dados de categoria
const TECH_DATABASE: Record<string, TechToolInfo> = {
    react: { name: 'React', category: 'Frontend', color: '#61DAFB', bgColor: '#0B2530', borderColor: '#1F4F64', description: 'Biblioteca Javascript para interfaces interativas' },
    aws: { name: 'AWS', category: 'Cloud', color: '#FF9900', bgColor: '#251A08', borderColor: '#52340B', description: 'Nuvem e infraestrutura em escala global' },
    amazon: { name: 'AWS', category: 'Cloud', color: '#FF9900', bgColor: '#251A08', borderColor: '#52340B', description: 'Nuvem e infraestrutura Amazon Web Services' },
    salesforce: { name: 'Salesforce', category: 'CRM', color: '#00A1E0', bgColor: '#052233', borderColor: '#0E4968', description: 'Plataforma líder em gestão de relacionamento e CRM' },
    hubspot: { name: 'HubSpot', category: 'CRM', color: '#FF7A59', bgColor: '#2B140D', borderColor: '#5E2718', description: 'CRM de Inbound Marketing e Vendas' },
    wordpress: { name: 'WordPress', category: 'Frontend', color: '#21759B', bgColor: '#081720', borderColor: '#10374D', description: 'CMS e gerenciador de conteúdo web' },
    shopify: { name: 'Shopify', category: 'E-commerce', color: '#7AB55C', bgColor: '#10210A', borderColor: '#294B1B', description: 'Plataforma de E-commerce e lojas virtuais' },
    googleanalytics: { name: 'Google Analytics', category: 'Analytics', color: '#EA4335', bgColor: '#2B0E0B', borderColor: '#5B1F19', description: 'Análise de tráfego e comportamento de usuários' },
    gtm: { name: 'Google Tag Manager', category: 'Analytics', color: '#4285F4', bgColor: '#0C1A30', borderColor: '#183664', description: 'Gerenciador de tags e mensuração web' },
    sap: { name: 'SAP', category: 'CRM', color: '#008FD3', bgColor: '#051D2A', borderColor: '#0B425F', description: 'ERP corporativo e sistemas de gestão integrada' },
    docker: { name: 'Docker', category: 'DevOps', color: '#2496ED', bgColor: '#091D2E', borderColor: '#124168', description: 'Contêineres de aplicação para implantação ágil' },
    kubernetes: { name: 'Kubernetes', category: 'DevOps', color: '#326CE5', bgColor: '#0B1630', borderColor: '#162F64', description: 'Orquestrador de microsserviços em contêiner' },
    python: { name: 'Python', category: 'Backend', color: '#3776AB', bgColor: '#0A1824', borderColor: '#15354F', description: 'Linguagem de programação para backend e IA' },
    nodejs: { name: 'Node.js', category: 'Backend', color: '#339933', bgColor: '#081D08', borderColor: '#144314', description: 'Runtime Javascript assíncrono para servidores' },
    node: { name: 'Node.js', category: 'Backend', color: '#339933', bgColor: '#081D08', borderColor: '#144314', description: 'Runtime Javascript assíncrono para servidores' },
    postgresql: { name: 'PostgreSQL', category: 'Database', color: '#4169E1', bgColor: '#0C142B', borderColor: '#1B2C5C', description: 'Banco de dados relacional avançado open-source' },
    postgres: { name: 'PostgreSQL', category: 'Database', color: '#4169E1', bgColor: '#0C142B', borderColor: '#1B2C5C', description: 'Banco de dados relacional avançado open-source' },
    redis: { name: 'Redis', category: 'Database', color: '#DC382D', bgColor: '#280A08', borderColor: '#5C1713', description: 'Banco em memória para cache e altíssima performance' },
    zendesk: { name: 'Zendesk', category: 'CRM', color: '#03363D', bgColor: '#021B1F', borderColor: '#06424B', description: 'Plataforma de suporte ao cliente e helpdesk' },
    mailchimp: { name: 'Mailchimp', category: 'Marketing', color: '#FFE01B', bgColor: '#2E2800', borderColor: '#665900', description: 'Plataforma de Automação de E-mail Marketing' },
    stripe: { name: 'Stripe', category: 'Outros', color: '#635BFF', bgColor: '#141236', borderColor: '#2E2A78', description: 'Infraestrutura de pagamentos e cobrança online' },
    slack: { name: 'Slack', category: 'Outros', color: '#4A154B', bgColor: '#1A061B', borderColor: '#400E42', description: 'Comunicação interna e colaboração corporativa' },
    jira: { name: 'Jira', category: 'Outros', color: '#0052CC', bgColor: '#04132B', borderColor: '#082C63', description: 'Gestão de projetos e equipes ágeis da Atlassian' },
    cloudflare: { name: 'Cloudflare', category: 'Cloud', color: '#F38020', bgColor: '#2A1605', borderColor: '#5C310B', description: 'CDN, segurança contra DDoS e otimização DNS' },
    azure: { name: 'Microsoft Azure', category: 'Cloud', color: '#0089D6', bgColor: '#041C2B', borderColor: '#0A3F61', description: 'Plataforma de nuvem da Microsoft' },
    googlecloud: { name: 'Google Cloud', category: 'Cloud', color: '#4285F4', bgColor: '#0C1A30', borderColor: '#183664', description: 'Plataforma de serviços em nuvem do Google' },
    gcp: { name: 'Google Cloud', category: 'Cloud', color: '#4285F4', bgColor: '#0C1A30', borderColor: '#183664', description: 'Plataforma de serviços em nuvem do Google' },
    vue: { name: 'Vue.js', category: 'Frontend', color: '#4FC08D', bgColor: '#0B2117', borderColor: '#194A34', description: 'Framework progressivo para interfaces web' },
    angular: { name: 'Angular', category: 'Frontend', color: '#DD0031', bgColor: '#290008', borderColor: '#5C0015', description: 'Framework frontend corporativo do Google' },
    nextjs: { name: 'Next.js', category: 'Frontend', color: '#000000', bgColor: '#171717', borderColor: '#333333', description: 'Framework React com SSR e renderização híbrida' },
    next: { name: 'Next.js', category: 'Frontend', color: '#000000', bgColor: '#171717', borderColor: '#333333', description: 'Framework React com SSR e renderização híbrida' },
    pipedrive: { name: 'Pipedrive', category: 'CRM', color: '#222222', bgColor: '#141414', borderColor: '#333333', description: 'CRM de vendas e funil de prospecção' },
    activecampaign: { name: 'ActiveCampaign', category: 'Marketing', color: '#356AE6', bgColor: '#0A1530', borderColor: '#162F66', description: 'Automação de e-mail e experiência do cliente' },
    rdstation: { name: 'RD Station', category: 'Marketing', color: '#00C896', bgColor: '#00261D', borderColor: '#005743', description: 'Automação de Marketing Digital líder no Brasil' },
    totvs: { name: 'TOTVS', category: 'CRM', color: '#002B49', bgColor: '#001424', borderColor: '#00375E', description: 'ERP e sistemas integrados de gestão empresarial' },
    oracle: { name: 'Oracle', category: 'Database', color: '#F80000', bgColor: '#290000', borderColor: '#5E0000', description: 'Banco de dados corporativo de alto desempenho' },
    mysql: { name: 'MySQL', category: 'Database', color: '#4479A1', bgColor: '#0D171F', borderColor: '#1D3547', description: 'Sistema gerenciador de banco de dados open source' },
    mongodb: { name: 'MongoDB', category: 'Database', color: '#47A248', bgColor: '#0D1E0D', borderColor: '#1F4720', description: 'Banco de dados NoSQL orientado a documentos' },
    nginx: { name: 'Nginx', category: 'DevOps', color: '#009639', bgColor: '#001E0B', borderColor: '#00471A', description: 'Servidor web e proxy reverso de alta performance' },
    intercom: { name: 'Intercom', category: 'CRM', color: '#1F8DED', bgColor: '#071B2D', borderColor: '#103F68', description: 'Mensageria e atendimento ao cliente' },
    hotjar: { name: 'Hotjar', category: 'Analytics', color: '#FF3C00', bgColor: '#2B0A00', borderColor: '#5E1600', description: 'Mapas de calor e análise de experiência do usuário' },
};

// Ícones SVG estilizados para principais marcas
function getTechSvgIcon(normalizedName: string, color: string): React.ReactNode {
    switch (normalizedName) {
        case 'react':
            return (
                <svg className="w-3.5 h-3.5 animate-spin-slow" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="50" cy="50" r="10" fill={color} />
                    <ellipse cx="50" cy="50" rx="40" ry="15" stroke={color} strokeWidth="6" transform="rotate(0 50 50)" />
                    <ellipse cx="50" cy="50" rx="40" ry="15" stroke={color} strokeWidth="6" transform="rotate(60 50 50)" />
                    <ellipse cx="50" cy="50" rx="40" ry="15" stroke={color} strokeWidth="6" transform="rotate(120 50 50)" />
                </svg>
            );
        case 'aws':
        case 'amazon':
            return (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={color}>
                    <path d="M18.75 14.5c-2.3 1.7-5.5 2.6-8.4 2.6-4.1 0-7.7-1.5-10.4-4-.2-.2 0-.5.2-.3 3.1 2.3 7 3.7 11 3.7 2.6 0 5.5-.6 8-1.8.4-.2.8.2.6.5zm.9-2.2c-.3-.4-1.8-.2-2.5-.1-.2 0-.3-.2-.1-.3.8-.6 2.2-.4 2.7.1.5.6.1 2.1-.6 2.7-.2.2-.3.1-.2-.1.4-.7.9-1.9.7-2.3z" />
                </svg>
            );
        case 'salesforce':
            return (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={color}>
                    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
                </svg>
            );
        case 'docker':
            return (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={color}>
                    <path d="M13.98 11.08h-2.12v-2.1h2.12v2.1zm-3.17 0H8.68v-2.1h2.13v2.1zm-3.18 0H5.5v-2.1h2.13v2.1zm6.35-3.17h-2.12v-2.1h2.12v2.1zm-3.17 0H8.68v-2.1h2.13v2.1zm6.35 3.17h-2.12v-2.1h2.12v2.1zm-3.18-6.35h-2.12v-2.1h2.12v2.1zm10.27 4.76c-.33-.24-1.3-.87-2.73-.87-.87 0-1.68.22-2.31.6-.26.16-.48.33-.67.5h-.06c-.63-1.66-2.16-2.85-3.99-2.85h-6.84c-.41 0-.75.34-.75.75v5.71c0 3.39 2.76 6.15 6.15 6.15h5.17c3.16 0 5.86-2.4 6.13-5.54.02-.27.46-3.83.92-4.18z" />
                </svg>
            );
        case 'python':
            return (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={color}>
                    <path d="M11.9 2c-5.1 0-4.8 2.2-4.8 2.2v2.3h4.9v.7H5.1S2 6.9 2 12c0 5.2 2.7 5 2.7 5h1.6v-2.3c0-2.6 2.3-2.5 2.3-2.5h4.9c.7 0 1.2-.5 1.2-1.2V4.2C14.7 2.8 13.5 2 11.9 2zm-1.4 1.5c.5 0 .9.4.9.9s-.4.9-.9.9-.9-.4-.9-.9.4-.9.9-.9zm1.6 18.5c5.1 0 4.8-2.2 4.8-2.2v-2.3h-4.9v-.7h6.9s3.1.3 3.1-4.8c0-5.2-2.7-5-2.7-5h-1.6v2.3c0 2.6-2.3 2.5-2.3 2.5h-4.9c-.7 0-1.2.5-1.2 1.2v4.8c0 1.4 1.2 2.2 2.8 2.2zm1.4-1.5c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9-.4.9-.9.9z" />
                </svg>
            );
        case 'shopify':
            return (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={color}>
                    <path d="M15.34 3.75c-.06-.3-.3-.52-.6-.56l-3.32-.42c-.22-.03-.43.06-.57.24L9.5 4.82l-2.02.63c-.32.1-.53.39-.53.72v10.33c0 .41.34.75.75.75h9.6c.41 0 .75-.34.75-.75V4.24c0-.21-.09-.41-.24-.55l-2.47-.94zm-3.69 1.13l.89-1.15 2.24.28-.68 1.42-2.45-.55zm2.74 8.78c-.75.45-1.74.65-2.65.34-.91-.31-1.55-1.12-1.64-2.08-.02-.21.14-.4.35-.42.21-.02.4.14.42.35.06.66.5 1.22 1.13 1.44.63.22 1.33.08 1.85-.36.21-.18.52-.15.7.06.18.21.15.52-.06.7l-.1.07z" />
                </svg>
            );
        default:
            return (
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            );
    }
}

interface TechToolLogoProps {
    techName: string;
    showCategory?: boolean;
    size?: 'sm' | 'md' | 'lg';
    onClick?: (info: TechToolInfo) => void;
}

export const TechToolLogo: React.FC<TechToolLogoProps> = ({
    techName,
    showCategory = false,
    size = 'md',
    onClick
}) => {
    const normalized = techName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const info = TECH_DATABASE[normalized] || {
        name: techName,
        category: 'Outros' as const,
        color: '#3B82F6',
        bgColor: '#0F172A',
        borderColor: '#1E293B',
        description: `Ferramenta ou tecnologia ${techName} detectada no stack da empresa.`
    };

    const sizeClasses = {
        sm: 'px-2 py-0.5 text-[11px] gap-1.5',
        md: 'px-2.5 py-1 text-xs gap-2',
        lg: 'px-3.5 py-1.5 text-sm gap-2.5 font-medium'
    }[size];

    return (
        <button
            type="button"
            onClick={() => onClick?.(info)}
            title={`${info.name} (${info.category}) — ${info.description}`}
            className={`inline-flex items-center rounded-xl border font-semibold transition-all duration-300 transform hover:scale-105 hover:-translate-y-0.5 shadow-xs hover:shadow-md cursor-pointer group select-none ${sizeClasses}`}
            style={{
                backgroundColor: info.bgColor,
                borderColor: info.borderColor,
                color: info.color
            }}
        >
            <span className="flex items-center justify-center shrink-0 group-hover:rotate-12 transition-transform duration-300">
                {getTechSvgIcon(normalized, info.color)}
            </span>
            <span className="tracking-tight text-white/90 group-hover:text-white font-medium">{info.name}</span>
            {showCategory && (
                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.2 rounded-full bg-white/10 text-white/70 ml-0.5">
                    {info.category}
                </span>
            )}
        </button>
    );
};

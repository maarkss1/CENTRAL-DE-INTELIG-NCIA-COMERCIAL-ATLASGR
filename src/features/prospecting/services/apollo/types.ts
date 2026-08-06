import type { DecisionMaker } from '../prospecting.service';

export interface DecisionMakerCriteria {
    cargos?: string;
    senioridades?: string[];
    departamentos?: string[];
    cidade?: string;
    estado?: string;
    palavrasChavePerfil?: string;
    apenasEmailVerificado?: boolean;
}

export interface ApolloOrganization {
    id?: string;
    name?: string;
    website_url?: string;
    primary_domain?: string;
    estimated_num_employees?: number;
    city?: string;
    state?: string;
    industry?: string;
    linkedin_url?: string;
    twitter_url?: string;
    facebook_url?: string;
    phone?: string;
    primary_phone?: { number?: string };
    founded_year?: number;
    annual_revenue?: number;
    organization_revenue_printed?: string;
    keywords?: string[];
    technology_names?: string[];
    short_description?: string;
    logo_url?: string;
    alexa_ranking?: number;
    publicly_traded_symbol?: string | null;
    market_cap?: string | null;
    sic_codes?: string[];
}

export interface ApolloSearchResponse {
    organizations?: ApolloOrganization[];
}

export interface ApolloContact {
    name: string;
    title: string | null;
    email: string | null;
    phone: string | null;
    linkedin_url: string | null;
}

/** Shape do objeto pessoa retornado pela Apollo People Search / People Match API. */
export interface ApolloPersonRaw {
    first_name?: string;
    last_name?: string;
    title?: string;
    email?: string;
    email_url?: string;
    phone_numbers?: Array<{ raw_number?: string }>;
    sanitized_phone?: string;
    linkedin_url?: string;
}

export type { DecisionMaker };

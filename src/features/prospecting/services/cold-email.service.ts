import { logger } from '../../../lib/logger';

export interface ColdEmailCampaign {
    id: string;
    targetEmail: string;
    subject: string;
    body: string;
    status: 'draft' | 'sent' | 'failed';
    legalBasis: 'legitimate_interest' | 'consent';
    dataSource: string;
}

export async function sendColdEmail(campaign: ColdEmailCampaign): Promise<boolean> {
    try {
        if (!campaign.targetEmail || !campaign.subject || !campaign.body) {
            throw new Error('Missing required fields for cold email.');
        }

        if (!campaign.legalBasis || !campaign.dataSource) {
            throw new Error('LGPD compliance requires legal basis and data source for cold outreach.');
        }

        logger.info({ campaignId: campaign.id, to: campaign.targetEmail, basis: campaign.legalBasis }, 'Sending cold email');
        
        return true;
    } catch (error) {
        logger.error({ err: error, campaignId: campaign.id }, 'Failed to send cold email');
        return false;
    }
}

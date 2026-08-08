import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../logger.js';

// Client S3-compatível genérico: funciona sem nenhuma mudança de código contra MinIO (dev local,
// docker-compose), Cloudflare R2 ou Supabase Storage (S3-compatible, ver
// https://supabase.com/docs/guides/storage/s3/authentication) — só troca o endpoint/credenciais via
// env. STORAGE_* é o nome canônico; MINIO_* continua aceito como alias (compat com quem já tinha
// essas vars configuradas) e é usado só se STORAGE_* não estiver definido.
const STORAGE_ENDPOINT = process.env.STORAGE_ENDPOINT || process.env.MINIO_ENDPOINT || 'http://localhost:9000';
const STORAGE_ACCESS_KEY = process.env.STORAGE_ACCESS_KEY_ID || process.env.MINIO_ACCESS_KEY;
const STORAGE_SECRET_KEY = process.env.STORAGE_SECRET_ACCESS_KEY || process.env.MINIO_SECRET_KEY;
// Supabase Storage exige a region do projeto (ver dashboard Storage > S3 Connection); R2 aceita
// 'auto'; MinIO ignora o valor mas o SDK exige que a option esteja presente.
const STORAGE_REGION = process.env.STORAGE_REGION || 'us-east-1';
const BUCKET_NAME = process.env.STORAGE_BUCKET || 'prospector-assets';

// Sem fallback para credenciais padrão (ex.: minioadmin/minioadmin) — um serviço de
// armazenamento configurado com credenciais públicas conhecidas é uma armadilha de
// segurança latente assim que alguma rota passar a usá-lo. Falha explícita em vez disso.
function getS3Client(): S3Client {
    if (!STORAGE_ACCESS_KEY || !STORAGE_SECRET_KEY) {
        throw new Error('STORAGE_ACCESS_KEY_ID e STORAGE_SECRET_ACCESS_KEY precisam ser configurados para usar o storage de objetos.');
    }
    return new S3Client({
        endpoint: STORAGE_ENDPOINT,
        region: STORAGE_REGION,
        credentials: {
            accessKeyId: STORAGE_ACCESS_KEY,
            secretAccessKey: STORAGE_SECRET_KEY,
        },
        forcePathStyle: true, // Necessário para MinIO/R2/Supabase Storage (path-style, não virtual-hosted-style).
    });
}

export const getUploadUrl = async (key: string, contentType: string) => {
    try {
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            ContentType: contentType,
        });
        const signedUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 3600 });
        return { signedUrl, key };
    } catch (err) {
        logger.error({ err, key }, 'Error generating upload URL');
        throw new Error('Failed to generate upload URL');
    }
};

export const getDownloadUrl = async (key: string) => {
    try {
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        });
        const signedUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 3600 });
        return { signedUrl, key };
    } catch (err) {
        logger.error({ err, key }, 'Error generating download URL');
        throw new Error('Failed to generate download URL');
    }
};

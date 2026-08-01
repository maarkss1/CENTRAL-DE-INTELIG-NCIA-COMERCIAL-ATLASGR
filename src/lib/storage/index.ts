import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../logger.js';

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY;
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY;
const BUCKET_NAME = process.env.STORAGE_BUCKET || 'prospector-assets';

// Sem fallback para credenciais padrão (ex.: minioadmin/minioadmin) — um serviço de
// armazenamento configurado com credenciais públicas conhecidas é uma armadilha de
// segurança latente assim que alguma rota passar a usá-lo. Falha explícita em vez disso.
function getS3Client(): S3Client {
    if (!MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) {
        throw new Error('MINIO_ACCESS_KEY e MINIO_SECRET_KEY precisam ser configurados para usar o storage de objetos.');
    }
    return new S3Client({
        endpoint: MINIO_ENDPOINT,
        region: 'us-east-1', // MinIO default
        credentials: {
            accessKeyId: MINIO_ACCESS_KEY,
            secretAccessKey: MINIO_SECRET_KEY,
        },
        forcePathStyle: true, // Crucial for MinIO
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

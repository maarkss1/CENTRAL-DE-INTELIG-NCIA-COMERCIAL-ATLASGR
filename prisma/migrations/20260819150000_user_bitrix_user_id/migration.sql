-- Coluna adicionada ao schema.prisma (commit 7cd5acc) sem migration correspondente — descoberta
-- durante a reconciliação do schema duplicado de Account Intelligence (onda 26): `prisma migrate
-- deploy` já rodava sem erro (coluna opcional, nada a validar), mas qualquer leitura real via
-- `User.findFirst()`/etc. falhava com "column user.bitrixUserId does not exist" porque a tabela
-- nunca recebeu a coluna. Nullable e sem uso em código de aplicação ainda — mesmo padrão de
-- `bitrixLeadId`/`bitrixDealId` em Lead, reservada para vincular um usuário ao Bitrix24 no futuro.
ALTER TABLE "user" ADD COLUMN "bitrixUserId" INTEGER;

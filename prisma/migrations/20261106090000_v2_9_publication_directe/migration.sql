-- Plus d'approbation : un commentaire resté en attente devient masqué, jamais
-- publié sans décision. Le défaut de la colonne suit le renommage.
ALTER TYPE "CommentStatus" RENAME VALUE 'PENDING' TO 'HIDDEN';

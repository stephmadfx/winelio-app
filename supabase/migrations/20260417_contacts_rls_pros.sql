-- Permettre au professionnel d'une recommandation de lire les coordonnées
-- du contact concerné. Sans ça, le pro ne peut pas voir email/phone du lead
-- qu'on lui envoie → feature Setup Intent inutile car rien à afficher.
--
-- Écriture / suppression restent réservées au propriétaire du contact
-- (le referrer qui l'a créé).

-- Remplace la policy ALL par 2 policies distinctes (SELECT plus permissif)
DROP POLICY IF EXISTS contacts_all ON winelio.contacts;

-- Owner : CRUD complet
CREATE POLICY contacts_owner_all ON winelio.contacts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Pros : lecture seule des contacts d'une reco dont ils sont le professional
CREATE POLICY contacts_pro_select ON winelio.contacts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM winelio.recommendations r
      WHERE r.contact_id = contacts.id
        AND r.professional_id = auth.uid()
    )
  );

# Guide Bilingue - Inventaire / Bilingual Inventory Guide

**Système de gestion d'inventaire bilingue pour GFS**
**Bilingual inventory management system for GFS**

---

## 🇫🇷 Format Excel / 🇬🇧 Excel Format

### Colonnes Requises / Required Columns:

| Colonne / Column | Français | English | Requis / Required |
|-----------------|----------|---------|-------------------|
| **Item_Code** | Code d'article | Item Code | ✅ Oui / Yes |
| **Counted_Cases** | Caisses comptées | Cases Counted | ✅ Oui / Yes |
| **Counted_Units** | Unités comptées | Units Counted | ⭕ Optionnel / Optional |
| **Location** | Emplacement | Location | ⭕ Optionnel / Optional |
| **Notes** | Notes | Notes | ⭕ Optionnel / Optional |

---

## 📊 Exemple / Example

### Format GFS (ce que vous voyez / what you see):

```
PRODUIT: Pâtés impériaux aux légumes
#1001042 | Wong Wing | 1.13 kilos
FORMAT: Boîte / Unité
PRIX: 83,88 $
QTÉ: 6 (Boîte) + 2 (Unité)
TOTAL: 503,28 $
```

### Format Excel (ce que vous entrez / what you enter):

| Item_Code | Description | Counted_Cases | Counted_Units | Location | Notes |
|-----------|-------------|---------------|---------------|----------|-------|
| 1001042 | Pâtés impériaux aux légumes | 6 | 2 | Freezer A | |

---

## 🔢 Logique de Comptage / Counting Logic

### En Français:
- **Caisses (Boîte)** = Caisses complètes comptées
- **Unités** = Articles individuels en vrac
- **Exemple**: 6 caisses + 2 unités = 6,XX caisses totales

### In English:
- **Cases (Boîte)** = Full cases counted
- **Units** = Individual loose items
- **Example**: 6 cases + 2 units = 6.XX total cases

---

## 📍 Emplacements / Locations

### Suggestions d'emplacements / Location Suggestions:

**🇫🇷 Français:**
- Congélateur A / Congélateur B
- Réfrigérateur A / Réfrigérateur B
- Entreposage sec - Étagère 1
- Zone de réception
- Congélateur-chambre

**🇬🇧 English:**
- Freezer A / Freezer B
- Cooler A / Cooler B
- Dry Storage - Shelf 1
- Receiving Area
- Walk-in Freezer

---

## 🚀 Importation / Import

### Commande / Command:

```bash
node import_count_from_excel.js votre_fichier.xlsx
node import_count_from_excel.js your_file.xlsx
```

### Ce qui se passe / What happens:

1. **Lecture du fichier** / **Read file**
   - Détection automatique des colonnes
   - Automatic column detection

2. **Calcul des variances** / **Calculate variances**
   - Compté vs Attendu
   - Counted vs Expected

3. **Sauvegarde** / **Save**
   - Caisses et unités séparées
   - Cases and units stored separately
   - Emplacement sauvegardé
   - Location saved

---

## 📝 Workflow Complet / Complete Workflow

### 🇫🇷 En Français:

1. **Préparer le Compte**
   ```bash
   node prepare_cutoff_inventory.js
   # Entrez: 2025-07-28 (dernière commande de juillet)
   ```

2. **Verrouiller les Commandes Futures**
   ```bash
   node lock_orders_after_cutoff.js
   ```

3. **Exporter la Feuille de Compte**
   ```bash
   node export_count_sheet.js
   ```

4. **Compter Physiquement**
   - Ouvrir le fichier exporté dans Excel
   - Compter vos articles
   - Remplir: Counted_Cases, Counted_Units
   - Ajouter: Location (Congélateur A, etc.)

5. **Importer les Résultats**
   ```bash
   node import_count_from_excel.js compte_juillet.xlsx
   ```

6. **Créer un Snapshot**
   ```bash
   node create_inventory_snapshot.js
   # Nom: "Juillet 2025 Fin de Mois"
   ```

7. **Générer Rapports**
   ```bash
   node report_from_snapshot.js
   ```

---

### 🇬🇧 In English:

1. **Prepare Count**
   ```bash
   node prepare_cutoff_inventory.js
   # Enter: 2025-07-28 (last July order)
   ```

2. **Lock Future Orders**
   ```bash
   node lock_orders_after_cutoff.js
   ```

3. **Export Count Sheet**
   ```bash
   node export_count_sheet.js
   ```

4. **Physical Count**
   - Open exported file in Excel
   - Count your items
   - Fill: Counted_Cases, Counted_Units
   - Add: Location (Freezer A, etc.)

5. **Import Results**
   ```bash
   node import_count_from_excel.js july_count.xlsx
   ```

6. **Create Snapshot**
   ```bash
   node create_inventory_snapshot.js
   # Name: "July 2025 Month-End"
   ```

7. **Generate Reports**
   ```bash
   node report_from_snapshot.js
   ```

---

## 💡 Conseils / Tips

### 🇫🇷 Français:

**Codes d'Articles:**
- Les codes sont les mêmes en français et en anglais
- #1001042 = même code partout
- Pas besoin de conversion

**Colonnes Flexibles:**
- Le système détecte: "Counted_Cases", "Cases", "Boîte", "Boite"
- Le système détecte: "Counted_Units", "Units", "Unité", "Unite"
- Utilisez les noms qui vous conviennent

**Unités:**
- Si pas d'unités en vrac, laissez vide ou mettez 0
- Le système accepte les deux

---

### 🇬🇧 English:

**Item Codes:**
- Codes are the same in French and English
- #1001042 = same code everywhere
- No conversion needed

**Flexible Columns:**
- System detects: "Counted_Cases", "Cases", "Boîte", "Boite"
- System detects: "Counted_Units", "Units", "Unité", "Unite"
- Use names that work for you

**Units:**
- If no loose units, leave blank or enter 0
- System accepts both

---

## 📋 Modèle / Template

### Fichier disponible / File available:
```
data/inventory_counts/inventory_count_template_bilingual.csv
```

### Ouvrir dans Excel / Open in Excel:
```bash
open data/inventory_counts/inventory_count_template_bilingual.csv
```

---

## ✅ Liste de Vérification / Checklist

### 🇫🇷 Avant l'import / 🇬🇧 Before import:

- [ ] Colonne Item_Code remplie / Item_Code column filled
- [ ] Colonne Counted_Cases remplie / Counted_Cases column filled
- [ ] Counted_Units (si applicable) / Counted_Units (if applicable)
- [ ] Locations ajoutées / Locations added
- [ ] Fichier sauvegardé comme .xlsx / File saved as .xlsx

### 🇫🇷 Après l'import / 🇬🇧 After import:

- [ ] Vérifier le résumé / Check summary
- [ ] Réviser les variances / Review variances
- [ ] Créer snapshot / Create snapshot
- [ ] Générer rapports / Generate reports

---

## 🎯 Support

**Le système supporte / The system supports:**
- ✅ Noms de colonnes français et anglais
- ✅ French and English column names
- ✅ Codes d'articles GFS standards
- ✅ Standard GFS item codes
- ✅ Caisses et unités séparées
- ✅ Separate cases and units
- ✅ Emplacements bilingues
- ✅ Bilingual locations

**Vous êtes prêt! / You're ready!** 🚀

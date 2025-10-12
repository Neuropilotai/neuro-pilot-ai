#!/usr/bin/env python3
"""
Enhanced English Translation for Inventory Items
Uses comprehensive French-to-English food dictionary
"""

import sqlite3
import re
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / 'data' / 'enterprise_inventory.db'

# Comprehensive translation mapping
TRANSLATIONS = {
    # Complete phrases first (to avoid partial matches)
    'pâtés impériaux aux légumes': 'vegetable egg rolls',
    'pâtés impériaux': 'egg rolls',
    'rouleau aux oeufs': 'egg roll',
    'saucisse à déjeuner': 'breakfast sausage',
    'sac à ordures': 'garbage bag',
    'pâte à biscuits': 'cookie dough',
    'pain baguettine': 'small baguette bread',
    'beurre d\'arachides': 'peanut butter',
    'pâte de tomates': 'tomato paste',
    'cornichons à l\'aneth': 'dill pickles',
    'fromage à la crème': 'cream cheese',
    'pommes de terre': 'potatoes',
    'pellicule plastique': 'plastic wrap',
    'papier d\'aluminium': 'aluminum foil',

    # Proteins & Meats
    'saucisse': 'sausage',
    'saucisses': 'sausages',
    'jambon': 'ham',
    'bacon': 'bacon',
    'poulet': 'chicken',
    'porc': 'pork',
    'boeuf': 'beef',
    'bœuf': 'beef',
    'dinde': 'turkey',
    'thon': 'tuna',
    'saumon': 'salmon',
    'aiglefin': 'haddock',
    'longes': 'loins',
    'crevettes': 'shrimp',
    'viande': 'meat',
    'steak': 'steak',
    'côtelettes': 'chops',
    'escalopes': 'cutlets',

    # Eggs & Dairy
    'oeufs': 'eggs',
    'oeuf': 'egg',
    'œufs': 'eggs',
    'œuf': 'egg',
    'fromage': 'cheese',
    'mozzarella': 'mozzarella',
    'cheddar': 'cheddar',
    'parmesan': 'parmesan',
    'beurre': 'butter',
    'lait': 'milk',
    'crème': 'cream',
    'yogourt': 'yogurt',

    # Vegetables
    'légumes': 'vegetables',
    'laitue': 'lettuce',
    'tomates': 'tomatoes',
    'tomate': 'tomato',
    'concombres': 'cucumbers',
    'concombre': 'cucumber',
    'oignons': 'onions',
    'oignon': 'onion',
    'carottes': 'carrots',
    'carotte': 'carrot',
    'champignons': 'mushrooms',
    'champignon': 'mushroom',
    'coriandre': 'cilantro',
    'persil': 'parsley',
    'céleri': 'celery',
    'poivrons': 'peppers',
    'poivron': 'pepper',
    'brocoli': 'broccoli',
    'chou-fleur': 'cauliflower',
    'épinards': 'spinach',

    # Fruits
    'pommes': 'apples',
    'pomme': 'apple',
    'oranges': 'oranges',
    'orange': 'orange',
    'bananes': 'bananas',
    'banane': 'banana',
    'fraises': 'strawberries',
    'fraise': 'strawberry',
    'bleuets': 'blueberries',
    'framboises': 'raspberries',
    'raisins': 'grapes',
    'citron': 'lemon',
    'lime': 'lime',

    # Bakery & Grains
    'pain': 'bread',
    'pains': 'breads',
    'baguette': 'baguette',
    'miche': 'loaf',
    'tranche': 'sliced',
    'tranché': 'sliced',
    'tranchée': 'sliced',
    'biscuits': 'cookies',
    'biscuit': 'cookie',
    'pâte': 'dough',
    'pâtisserie': 'pastry',
    'croissant': 'croissant',
    'brioches': 'brioche',
    'pâtes': 'pasta',
    'spaghetti': 'spaghetti',
    'riz': 'rice',
    'farine': 'flour',

    # Condiments & Seasonings
    'huile': 'oil',
    'vinaigre': 'vinegar',
    'moutarde': 'mustard',
    'ketchup': 'ketchup',
    'mayonnaise': 'mayonnaise',
    'sel': 'salt',
    'poivre': 'pepper',
    'épices': 'spices',
    'sauce': 'sauce',
    'salsa': 'salsa',
    'guacamole': 'guacamole',

    # Sweets & Baking
    'sucre': 'sugar',
    'cassonade': 'brown sugar',
    'miel': 'honey',
    'sirop': 'syrup',
    'chocolat': 'chocolate',
    'vanille': 'vanilla',
    'confiture': 'jam',

    # Beverages
    'jus': 'juice',
    'café': 'coffee',
    'thé': 'tea',
    'eau': 'water',
    'vin': 'wine',
    'bière': 'beer',

    # Packaging & Supplies
    'sac': 'bag',
    'sacs': 'bags',
    'boîte': 'box',
    'boîtes': 'boxes',
    'pellicule': 'wrap',
    'plastique': 'plastic',
    'papier': 'paper',
    'serviettes': 'napkins',
    'assiettes': 'plates',
    'gobelets': 'cups',
    'fourchettes': 'forks',
    'couteaux': 'knives',
    'cuillères': 'spoons',

    # Descriptors - Size
    'petit': 'small',
    'petite': 'small',
    'petits': 'small',
    'petites': 'small',
    'moyen': 'medium',
    'moyenne': 'medium',
    'moyens': 'medium',
    'moyennes': 'medium',
    'grand': 'large',
    'grande': 'large',
    'grands': 'large',
    'grandes': 'large',
    'gros': 'large',
    'grosse': 'large',

    # Descriptors - Quality/Preparation
    'frais': 'fresh',
    'fraîche': 'fresh',
    'fraîches': 'fresh',
    'congelé': 'frozen',
    'congelée': 'frozen',
    'congelés': 'frozen',
    'surgelé': 'frozen',
    'cuit': 'cooked',
    'cuite': 'cooked',
    'cuits': 'cooked',
    'cru': 'raw',
    'crue': 'raw',
    'crus': 'raw',
    'râpé': 'shredded',
    'râpée': 'shredded',
    'râpés': 'shredded',
    'émietté': 'crumbled',
    'haché': 'chopped',
    'hachée': 'chopped',
    'entier': 'whole',
    'entière': 'whole',
    'entiers': 'whole',
    'entières': 'whole',
    'liquide': 'liquid',
    'liquides': 'liquid',
    'poudre': 'powder',
    'émincé': 'sliced thin',

    # Colors
    'noir': 'black',
    'noire': 'black',
    'noirs': 'black',
    'blanc': 'white',
    'blanche': 'white',
    'blancs': 'white',
    'rouge': 'red',
    'rouges': 'red',
    'vert': 'green',
    'verte': 'green',
    'verts': 'green',
    'jaune': 'yellow',
    'jaunes': 'yellow',
    'brun': 'brown',
    'brune': 'brown',
    'bruns': 'brown',
    'doré': 'golden',
    'dorée': 'golden',
    'dorés': 'golden',

    # Other descriptors
    'ultrarésistant': 'heavy duty',
    'résistant': 'strong',
    'épais': 'thick',
    'épaisse': 'thick',
    'mince': 'thin',
    'léger': 'light',
    'légère': 'light',
    'lourd': 'heavy',
    'lourde': 'heavy',
    'gourmet': 'gourmet',
    'qualité': 'quality',
    'premium': 'premium',

    # Actions/States
    'décongeler': 'thaw',
    'servir': 'serve',
    'prêt': 'ready',
    'prête': 'ready',
    'emballé': 'packed',
    'emballée': 'packed',
    'lavé': 'washed',
    'lavée': 'washed',
    'paré': 'trimmed',
    'parée': 'trimmed',
    'élevé': 'raised',
    'élevée': 'raised',
    'élevées': 'raised',
    'élevés': 'raised',

    # Common words
    'de': '',
    'du': '',
    'des': '',
    'le': '',
    'la': '',
    'les': '',
    'au': '',
    'aux': '',
    'avec': 'with',
    'sans': 'without',
    'en': 'in',
    'sur': 'on',
    'sous': 'under',
    'pour': 'for',
    'et': 'and',
    'ou': 'or',

    # Specific terms
    'calibre': 'grade',
    'poules': 'hens',
    'liberté': 'free-range',
    'iceberg': 'iceberg',
    'romaine': 'romaine',
    'serre': 'greenhouse',
    'anglais': 'english',
    'délicieuse': 'delicious',
    'royal gala': 'royal gala',
    'suprême': 'supreme',
    'assortiment': 'assorted',
    'assortiment': 'assorted',
}

def translate_description(french_text):
    """Translate French description to English"""
    if not french_text:
        return french_text

    # Remove trailing ellipsis and extra spaces
    text = re.sub(r'\.{3}$', '', french_text.strip())

    # Convert to lowercase for matching
    result = text.lower()

    # Sort by length (longest first) to match phrases before individual words
    sorted_trans = sorted(TRANSLATIONS.items(), key=lambda x: len(x[0]), reverse=True)

    # Apply translations
    for french, english in sorted_trans:
        if french:  # Skip empty strings
            # Use word boundaries
            pattern = r'\b' + re.escape(french) + r'\b'
            if english:
                result = re.sub(pattern, english, result, flags=re.IGNORECASE)
            else:
                # Remove the word
                result = re.sub(pattern, '', result, flags=re.IGNORECASE)

    # Clean up
    result = re.sub(r'\s+', ' ', result).strip()  # Multiple spaces
    result = re.sub(r'\s*,\s*', ', ', result)     # Comma spacing
    result = re.sub(r',\s*,', ',', result)         # Double commas
    result = result.strip(',').strip()              # Leading/trailing commas

    # Capitalize
    result = ' '.join(word.capitalize() for word in result.split())

    # Remove empty parentheses, brackets, etc.
    result = re.sub(r'\(\s*\)', '', result)
    result = re.sub(r'\[\s*\]', '', result)

    return result

def main():
    print("="*70)
    print("ENHANCED ENGLISH TRANSLATION")
    print("="*70)
    print()

    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    # Get all items
    cursor.execute('''
        SELECT item_id, item_code, item_name
        FROM inventory_items
        WHERE is_active = 1
        ORDER BY item_code
    ''')

    items = cursor.fetchall()
    print(f"📦 Translating {len(items)} items\n")

    translated = 0

    print("Sample translations:")
    for i, (item_id, item_code, french_name) in enumerate(items):
        english_name = translate_description(french_name)

        # Show first 15 examples
        if i < 15:
            print(f"  #{item_code}")
            print(f"    FR: {french_name}")
            print(f"    EN: {english_name}")
            print()

        # Update database
        cursor.execute('''
            UPDATE inventory_items
            SET item_name = ?, updated_at = datetime('now')
            WHERE item_id = ?
        ''', (english_name, item_id))
        translated += 1

        if (i + 1) % 100 == 0:
            print(f"  Progress: {i + 1}/{len(items)}...")

    conn.commit()
    conn.close()

    print(f"\n✅ Translation complete!")
    print(f"  📝 Translated: {translated} items")
    print(f"\n{'='*70}")
    print("✅ INVENTORY NOW IN ENGLISH")
    print("="*70)

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
Translate French Inventory Items to English
Uses item codes and French-to-English food terminology mapping
"""

import sqlite3
import re
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / 'data' / 'enterprise_inventory.db'

# French to English translation dictionary for food items
TRANSLATIONS = {
    # Proteins
    'saucisse': 'sausage',
    'saucisses': 'sausages',
    'jambon': 'ham',
    'bacon': 'bacon',
    'poulet': 'chicken',
    'porc': 'pork',
    'boeuf': 'beef',
    'dinde': 'turkey',
    'thon': 'tuna',
    'saumon': 'salmon',
    'aiglefin': 'haddock',
    'crevettes': 'shrimp',
    'viande': 'meat',

    # Eggs & Dairy
    'oeufs': 'eggs',
    'oeuf': 'egg',
    'fromage': 'cheese',
    'mozzarella': 'mozzarella',
    'cheddar': 'cheddar',
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
    'pommes de terre': 'potatoes',
    'oignons': 'onions',
    'oignon': 'onion',
    'carottes': 'carrots',
    'carotte': 'carrot',
    'champignons': 'mushrooms',
    'champignon': 'mushroom',
    'coriandre': 'cilantro',
    'persil': 'parsley',

    # Fruits
    'pommes': 'apples',
    'pomme': 'apple',
    'oranges': 'oranges',
    'bananes': 'bananas',
    'fraises': 'strawberries',

    # Bakery
    'pain': 'bread',
    'pains': 'breads',
    'baguette': 'baguette',
    'baguettine': 'small baguette',
    'croissant': 'croissant',
    'miche': 'loaf',
    'biscuits': 'cookies',
    'biscuit': 'cookie',
    'pâte': 'dough',
    'pâtisserie': 'pastry',

    # Prepared Foods
    'pâtés impériaux': 'egg rolls',
    'rouleau aux oeufs': 'egg roll',
    'guacamole': 'guacamole',
    'soupe': 'soup',
    'sauce': 'sauce',
    'salsa': 'salsa',

    # Condiments & Ingredients
    'huile': 'oil',
    'vinaigre': 'vinegar',
    'moutarde': 'mustard',
    'ketchup': 'ketchup',
    'mayonnaise': 'mayonnaise',
    'sel': 'salt',
    'poivre': 'pepper',
    'sucre': 'sugar',
    'farine': 'flour',
    'cassonade': 'brown sugar',
    'pâte de tomates': 'tomato paste',
    'cornichons': 'pickles',

    # Packaging & Misc
    'sac': 'bag',
    'sacs': 'bags',
    'pellicule': 'film',
    'plastique': 'plastic',
    'papier': 'paper',
    'serviettes': 'napkins',
    'assiettes': 'plates',

    # Descriptors
    'frais': 'fresh',
    'fraîche': 'fresh',
    'congelé': 'frozen',
    'congelée': 'frozen',
    'cuit': 'cooked',
    'cuite': 'cooked',
    'cru': 'raw',
    'tranché': 'sliced',
    'tranchée': 'sliced',
    'râpé': 'shredded',
    'râpée': 'shredded',
    'émietté': 'crumbled',
    'entier': 'whole',
    'entière': 'whole',
    'moyen': 'medium',
    'moyenne': 'medium',
    'grand': 'large',
    'grande': 'large',
    'petit': 'small',
    'petite': 'small',
    'noir': 'black',
    'blanc': 'white',
    'blanche': 'white',
    'rouge': 'red',
    'vert': 'green',
    'verte': 'green',
    'jaune': 'yellow',
    'doré': 'golden',
    'dorée': 'golden',
    'ultrarésistant': 'heavy duty',
    'résistant': 'resistant',
    'liquide': 'liquid',
    'liquides': 'liquid',

    # Other common terms
    'ordures': 'garbage',
    'déjeuner': 'breakfast',
    'dîner': 'dinner',
    'de qualité': 'quality',
    'décongeler': 'thaw',
    'servir': 'serve',
    'sans': 'without',
    'avec': 'with',
    'à': 'to',
    'de': 'of',
    'en': 'in',
    'le': 'the',
    'la': 'the',
    'les': 'the',
    'du': 'of the',
    'des': 'of the',
    'au': 'to the',
    'aux': 'to the',
    'calibre': 'grade',
    'poules': 'hens',
    'élevées': 'raised',
    'liberté': 'free-range',
    'iceberg': 'iceberg',
    'romaine': 'romaine',
    'serre': 'greenhouse',
    'anglais': 'english',
    'beurre d\'arachides': 'peanut butter',
    'crémeux': 'creamy',
    'tartiner': 'spread',
    'aneth': 'dill',
}

def translate_text(french_text):
    """Translate French food description to English"""
    if not french_text:
        return french_text

    # Convert to lowercase for matching
    text_lower = french_text.lower()
    result = text_lower

    # Sort translations by length (longest first) to avoid partial matches
    sorted_translations = sorted(TRANSLATIONS.items(), key=lambda x: len(x[0]), reverse=True)

    # Replace French terms with English
    for french, english in sorted_translations:
        # Use word boundaries to avoid partial matches
        pattern = r'\b' + re.escape(french) + r'\b'
        result = re.sub(pattern, english, result, flags=re.IGNORECASE)

    # Capitalize first letter of each word
    result = ' '.join(word.capitalize() for word in result.split())

    # Clean up multiple spaces
    result = re.sub(r'\s+', ' ', result).strip()

    return result

def main():
    print("="*70)
    print("TRANSLATING INVENTORY FROM FRENCH TO ENGLISH")
    print("="*70)
    print()

    # Connect to database
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    # Get all French items
    cursor.execute('''
        SELECT item_id, item_code, item_name
        FROM inventory_items
        WHERE is_active = 1
        ORDER BY item_code
    ''')

    items = cursor.fetchall()
    print(f"📦 Found {len(items)} items to translate\n")

    # Translate and update
    translated = 0
    unchanged = 0

    print("Sample translations:")
    for i, (item_id, item_code, french_name) in enumerate(items):
        # Translate
        english_name = translate_text(french_name)

        # Show first 10 examples
        if i < 10:
            print(f"  #{item_code}")
            print(f"    FR: {french_name}")
            print(f"    EN: {english_name}")
            print()

        # Update database
        if english_name != french_name:
            cursor.execute('''
                UPDATE inventory_items
                SET item_name = ?, updated_at = datetime('now')
                WHERE item_id = ?
            ''', (english_name, item_id))
            translated += 1
        else:
            unchanged += 1

        if (i + 1) % 50 == 0:
            print(f"  Progress: {i + 1}/{len(items)} items...")

    # Commit changes
    conn.commit()
    conn.close()

    print(f"\n✅ Translation complete!")
    print(f"  📝 Translated: {translated} items")
    print(f"  ⏭️  Unchanged: {unchanged} items")
    print(f"\n{'='*70}")
    print("✅ DONE - Inventory now in English")
    print("="*70)

if __name__ == '__main__':
    main()

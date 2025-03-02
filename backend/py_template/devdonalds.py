from dataclasses import dataclass
from typing import List, Dict, Union
from flask import Flask, request, jsonify
import re
from collections import deque, Counter

# ==== Type Definitions, feel free to add or modify ===========================
@dataclass
class CookbookEntry:
	name: str
	item_type: str

@dataclass
class RequiredItem():
	name: str
	quantity: int

@dataclass
class Recipe(CookbookEntry):
	required_items: List[RequiredItem]

@dataclass
class Ingredient(CookbookEntry):
	cook_time: int


# =============================================================================
# ==== HTTP Endpoint Stubs ====================================================
# =============================================================================
app = Flask(__name__)

# Store your recipes here!
cookbook = {}

# Task 1 helper (don't touch)
@app.route("/parse", methods=['POST'])
def parse():
	data = request.get_json()
	recipe_name = data.get('input', '')
	parsed_name = parse_handwriting(recipe_name)
	if parsed_name is None:
		return 'Invalid recipe name', 400
	return jsonify({'msg': parsed_name}), 200

# [TASK 1] ====================================================================
# Takes in a recipeName and returns it in a form that 
def parse_handwriting(recipeName: str) -> Union[str, None]:	
	# 1) remove - and _ to be replaced with space, and continuous spaces are reduced to one
	result = re.sub(r"[-_ ]+", " ", recipeName)

	# 2) Only keep alphabets and space
	result = re.sub(r"[^a-zA-Z ]+", "", result.strip())

	return result.title() if result != "" else None


# [TASK 2] ====================================================================
# Endpoint that adds a CookbookEntry to your magical cookbook
@app.route('/entry', methods=['POST'])
def create_entry():
	data = request.get_json()
	# Validate the type field
	entry_type = data.get('type')
	if not entry_type or (entry_type not in ["recipe", "ingredient"]):
		return 'Incorrect input, type can only be "recipe" or "ingredient"', 400

	# Validate the name field
	entry_name = data.get('name')
	if not entry_name or not isinstance(entry_name, str) or entry_name in cookbook:
		return 'Incorrect input, entry names must be unique', 400

	# If the type is "ingredient", validate the cookTime
	if entry_type == "ingredient":
		cook_time = data.get('cookTime')
		if cook_time is None or not isinstance(cook_time, (int, float)) or cook_time < 0:
			return 'Incorrect input, cookTime can only be greater than or equal to 0', 400
		else:
			# Valid input for ingredient, add the ingredient to the cookbook
			cookbook[entry_name] = Ingredient(name=entry_name, item_type="ingredient", cook_time=cook_time)
			return '', 200

	# The type is "recipe", validate requiredItems
	required_items = data.get('requiredItems')
	if not required_items or not isinstance(required_items, list):
		return 'Incorrect input, requiredItems for a recipe must be a list and cannot be empty', 400

	required_items_dict = {}
	for required_item in required_items:
		required_item_name = required_item.get('name')
		if not required_item_name or not isinstance(required_item_name, str) or required_item_name == entry_name:
			return f'Incorrect input, Recipe requiredItems can only have one element per name, {required_item_name}.', 400
		elif required_item_name in cookbook and is_reachable(required_item_name, entry_name):
			# This is actually an important check which prevents cycles from being formed.
			return f'A cycle would be formed if the {required_item_name} is part of {entry_name}', 400
		quantity = required_item.get('quantity')
		if not quantity or not isinstance(quantity, (int, float)) or quantity <= 0:
			return f'The quantity of the requiredItem {required_item_name} in a recipe must be greater than 0', 400
		
		required_items_dict[required_item_name] = RequiredItem(name=required_item_name, quantity=quantity)

	# Add the recipe to the cookbook
	cookbook[entry_name] = Recipe(name=entry_name, item_type="recipe", required_items=list(required_items_dict.values()))

	return '', 200



# The function below is to detect if a path exists from src to dest.
# In the cookbook, we can think of recipes and ingredients as a node
# An edge (A, B) would just be recipe A which has recipe B as a required Item
# This function is intended to be used for cycle detection when inserting an edge.
# This could be avoided if the requirements insisted a recipe cannot be added if the requiredItems are not in the cookbook

# Assumption: the src given is the name of an item that exists in the cookbook
def is_reachable(src: str, dest: str):
	item = cookbook[src]
	# Check if src is an ingredient, ingredients don't have outgoing edges
	if (item.item_type == "ingredient"):
		return False
	
	# item is of type "recipe"
	stack = deque([item])
	while stack:
		item = stack.pop()
		required_items = item.required_items

		# add all the items of type "recipe" to the stack
		for required_item in required_items:
			# check if the dest is part of required_items
			if (dest == required_item.name):
				return True
			elif (required_item.name not in cookbook):
				continue
			next_item = cookbook[required_item.name]
			if (next_item.item_type == "recipe"):
				stack.append(next_item)
	return False
# [TASK 3] ====================================================================
# Endpoint that returns a summary of a recipe that corresponds to a query name
@app.route('/summary', methods=['GET'])
def summary():
	name = request.args.get('name')
	if not name or name not in cookbook:
		return "Given recipe name not found in the cookbook", 400

	# Check if the recipe is actually a "recipe" type
	recipe = cookbook[name]
	if recipe.item_type != "recipe":
		return "Given name is not for a recipe", 400

    # Initialize ingredients counter and cook_time
	ingredients = Counter()
	ingredients[name] += 1
	recipes = deque([name])

    # Process all required recipes
	while recipes:
		recipe_name = recipes.pop()
		if recipe_name not in cookbook:
			return f"Recipe {recipe_name} not found in the cookbook", 400

		recipe = cookbook[recipe_name]

		# If the current item is an ingredient, just skip to next iteration
		if recipe.item_type == "ingredient":
			continue

		# Otherwise, it's a recipe, so add its required items
		for required_item in recipe.required_items:
			required_item_name = required_item.name
			# Check if required_item_name is in the cookbook
			if required_item_name not in cookbook:
				return f"{required_item_name} not found in the cookbook", 400
			recipes.append(required_item_name)
			ingredients[required_item_name] += (required_item.quantity * ingredients[recipe_name])
		# Remove current recipe from ingredients if exists
		del ingredients[recipe_name]

	# Prepare summary
	cook_time = 0
	summary_ingredients = []
	for ingredient_name, ingredient_quantity in ingredients.items():
		cook_time += (ingredient_quantity * cookbook[ingredient_name].cook_time)
		summary_ingredients.append({'name': ingredient_name, 'quantity': ingredient_quantity})
	
	summary = {
		"name": name,
		"cookTime": cook_time,
		"ingredients": summary_ingredients
	}

	return jsonify(summary), 200
	
				


		


# =============================================================================
# ==== DO NOT TOUCH ===========================================================
# =============================================================================

if __name__ == '__main__':
	app.run(debug=True, port=8080)

import express, { Request, Response } from "express";

// ==== Type Definitions, feel free to add or modify ==========================
interface cookbookEntry {
  name: string;
  type: string;
}

interface requiredItem {
  name: string;
  quantity: number;
}

interface recipe extends cookbookEntry {
  requiredItems: requiredItem[];
}

interface ingredient extends cookbookEntry {
  cookTime: number;
}


// =============================================================================
// ==== HTTP Endpoint Stubs ====================================================
// =============================================================================
const app = express();
app.use(express.json());

// Store your recipes here!
const cookbook = new Map<string, recipe | ingredient>();

// Task 1 helper (don't touch)
app.post("/parse", (req:Request, res:Response) => {
  const { input } = req.body;

  const parsed_string = parse_handwriting(input)
  if (parsed_string == null) {
    res.status(400).send("this string is cooked");
    return;
  } 
  res.json({ msg: parsed_string });
  return;
  
});

// [TASK 1] ====================================================================
// Takes in a recipeName and returns it in a form that 
const parse_handwriting = (recipeName: string): string | null => {
  // 1) Remove - and _ to be replaced with space, and continuous spaces are reduced to one
  let result = recipeName.replace(/[-_ ]+/g, " ");

  // 2) Only keep alphabets and space
  result = result.replace(/[^a-zA-Z ]+/g, "").toLowerCase();

  return result.trim() ? result.trim().replace(/\b[A-Za-z]/g, char => char.toUpperCase()) : null;
};


// [TASK 2] ====================================================================
// Endpoint that adds a CookbookEntry to your magical cookbook
app.post("/entry", (req:Request, res:Response) => {
  const data = req.body;

  // Validate the 'type' field
  const entryType = data.type;
  if (!entryType || !["recipe", "ingredient"].includes(entryType)) {
    return res.status(400).send('Incorrect input, type can only be "recipe" or "ingredient"');
  }

  // Validate the 'name' field
  const entryName = data.name;
  if (!entryName || typeof entryName !== 'string' || cookbook.has(entryName)) {
    return res.status(400).send('Incorrect input, entry names must be unique');
  }

  // If the type is "ingredient", validate the cookTime
  if (entryType === "ingredient") {
    // Validate cookTime for ingredients
    const cookTime = data.cookTime;
    if (typeof cookTime !== 'number' || cookTime < 0) {
      return res.status(400).send('Incorrect input, cookTime can only be greater than or equal to 0');
    }

    // Create and add the ingredient to the cookbook
    const ingredient: ingredient = { name: entryName, type: "ingredient", cookTime: cookTime };
    cookbook.set(entryName, ingredient);
    return res.status(200).send();
  }
  // The type is "recipe", so validate requiredItems
  const requiredItems = data.requiredItems;
  if (!Array.isArray(requiredItems) || requiredItems.length === 0) {
    return res.status(400).send('Incorrect input, requiredItems for a recipe must be a non-empty list');
  }
  
  const requiredItemsMap = new Map<string, requiredItem>();
  
  for (const requiredItem of requiredItems) {
    const requiredItemName = requiredItem.name;
    const quantity = requiredItem.quantity;
    
    if (!requiredItemName || typeof requiredItemName !== 'string' || requiredItemName === entryName) {
      return res.status(400).send(`Incorrect input, Recipe requiredItems can only have one element per name, ${requiredItemName}.`);
    }
    
    

    if (cookbook.has(requiredItemName) && isReachable(requiredItemName, entryName)) {
      return res.status(400).send(`The requiredItem ${requiredItemName} not found in the cookbook`);
    }
    
    if (typeof quantity !== 'number' || quantity <= 0) {
      return res.status(400).send(`The quantity of the requiredItem ${requiredItemName} in a recipe must be greater than 0`);
    }

    // Add to required items map
    requiredItemsMap.set(requiredItemName, { name: requiredItemName, quantity: quantity });
  }

  // Create and add the recipe to the cookbook
  const recipe: recipe = {
    name: entryName,
    type: "recipe",
    requiredItems: Array.from(requiredItemsMap.values())
  };

  cookbook.set(entryName, recipe);
  return res.status(200).send();
});



// The function below is to detect if a path exists from src to dest.
// In the cookbook, we can think of recipes and ingredients as a node
// An edge (A, B) would just be recipe A which has recipe B as a required Item
// This function is intended to be used for cycle detection when inserting an edge.
// This could be avoided if the requirements insisted a recipe cannot be added if the requiredItems are not in the cookbook

// Assumption: the src given is the name of an item that exists in the cookbook
const isReachable = (src: string, dest: string): boolean => {
  const item = cookbook.get(src);
  // Check if the item is an ingredient, ingredients don't have outgoing edges

  if (item.type === "ingredient") {
    return false;
  }

  // If the item is a "recipe"
  const stack: recipe[] = [item as recipe];

  while (stack.length > 0) {
    const currentItem = stack.pop();

    // Add all the requiredItems of type "recipe" to the stack
    for (const requiredItem of currentItem.requiredItems) {
			// Check if the dest is part of required_items
      if (requiredItem.name === dest) {
        return true;
      }
      const nextItem = cookbook.get(requiredItem.name);
      if (nextItem && nextItem.type === "recipe") {
        stack.push(nextItem as recipe);
      }
    }
  }
  return false;
};

// [TASK 3] ====================================================================
// Endpoint that returns a summary of a recipe that corresponds to a query name
app.get("/summary", (req:Request, res:Request) => {
  const name = req.query.name as string;

  if (!name || !cookbook.has(name)) {
    return res.status(400).send("Given recipe name not found in the cookbook");
  }

  // Check if the recipe is actually a "recipe" type
  const item = cookbook.get(name);
  if (item.type !== "recipe") {
    return res.status(400).send("Given name is not for a recipe");
  }

  // Initialize ingredients counter and cook_time
  const ingredients = new Map<string, number>();
  ingredients.set(name, 1);
  const recipes: string[] = [name];

  // Process all required recipes
  while (recipes.length > 0) {
    const recipeName = recipes.pop()!;
    const recipe = cookbook.get(recipeName);

    if (!recipe) {
      return res.status(400).send(`Recipe ${recipeName} not found in the cookbook`);
    }

    // If the current item is an ingredient, skip to the next iteration
    if (recipe.type === "ingredient") {
      continue;
    }

    // Otherwise, it's a recipe, so add its required items to the stack
    for (const requiredItem of (recipe as recipe).requiredItems) {
      const requiredItemName = requiredItem.name;
      
      // Check if requiredItemName exists in the cookbook
      if (!cookbook.has(requiredItemName)) {
        return res.status(400).send(`${requiredItemName} not found in the cookbook`);
      }

      // Add the required item to the recipes stack
      recipes.push(requiredItemName);

      // Update the ingredient count
      const existingQuantity = ingredients.get(requiredItemName) || 0;
      ingredients.set(requiredItemName, existingQuantity + requiredItem.quantity * (ingredients.get(recipeName) || 1));
    }

    // Remove current recipe from ingredients if exists
    ingredients.delete(recipeName);
  }

  // Prepare summary
  let cookTime = 0;
  const summaryIngredients: { name: string; quantity: number }[] = [];

  for (const [ingredientName, ingredientQuantity] of ingredients.entries()) {
    const ingredient = cookbook.get(ingredientName);
    if (ingredient && ingredient.type === "ingredient") {
      cookTime += ingredientQuantity * (ingredient as ingredient).cookTime;
      summaryIngredients.push({ name: ingredientName, quantity: ingredientQuantity });
    }
  }

  const summary = {
    name,
    cookTime,
    ingredients: summaryIngredients
  };

  return res.status(200).json(summary);
});

// =============================================================================
// ==== DO NOT TOUCH ===========================================================
// =============================================================================
const port = 8080;
app.listen(port, () => {
  console.log(`Running on: http://127.0.0.1:8080`);
});

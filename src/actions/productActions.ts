//@ts-nocheck
"use server";

import { sql } from "kysely";
import { DEFAULT_PAGE_SIZE } from "../../constant";
import { db } from "../../db";
import { InsertProducts, UpdateProducts } from "@/types";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/utils/authOptions";
import { cache } from "react";

export async function getProducts(
  pageNo = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  sortBy?: string,
  filters?: {
    brandId?: string;
    categoryId?: string;
    gender?: string;
    occasions?: string;
    discount?: string;
    priceRangeTo?: string;
  }
) {
  try {
    const safePageNo = Math.max(1, pageNo);
    const offset = (safePageNo - 1) * pageSize;

    // Count total products
    const countQuery = db.selectFrom("products").select(sql`COUNT(DISTINCT id) as count`);
    
    // Clone of query for filtering (to avoid duplicating filter logic)
    let filterQuery = db.selectFrom("products").selectAll();

    // Filters
    if (filters) {
      if (filters.brandId) {
        const brandIds = filters.brandId.split(",").map(Number);
        filterQuery = filterQuery.where((eb) =>
          eb.or(
            brandIds.map((id) =>
              eb(
                sql<boolean>`JSON_CONTAINS(CAST(products.brands AS JSON), JSON_ARRAY(${id}))`,
                "=",
                true
              )
            )
          )
        );
      }

      if (filters.gender) {
        filterQuery = filterQuery.where("gender", "=", filters.gender);
      }

      if (filters.occasions) {
        const occasionList = filters.occasions.split(",");
        filterQuery = filterQuery.where("occasion", "in", occasionList);
      }

      if (filters.discount) {
        const [from, to] = filters.discount.split("-").map(Number);
        filterQuery = filterQuery
          .where("discount", ">=", from)
          .where("discount", "<=", to);
      }

      if (filters.priceRangeTo) {
        const priceTo = Number(filters.priceRangeTo);
        filterQuery = filterQuery.where("price", "<=", priceTo);
      }
    }

    // Clone for count
    const countResult = await countQuery.executeTakeFirst();
    const count = countResult?.count ?? 0;
    const lastPage = Math.ceil(count / pageSize);

    // Sorting
    if (sortBy) {
      const [column, order] = sortBy.split("-");
      if (column && (order === "asc" || order === "desc")) {
        filterQuery = filterQuery.orderBy(column, order);
      }
    }

    // Apply pagination
    const products = await filterQuery
      .offset(offset)
      .limit(pageSize)
      .execute();

    const numOfResultsOnCurPage = products.length;

    return { products, count, lastPage, numOfResultsOnCurPage };
  } catch (error) {
    console.error("Error fetching products:", error);
    throw error;
  }
}

export const getProduct = cache(async function getProduct(productId: number) {
  // console.log("run");
  try {
    const product = await db
      .selectFrom("products")
      .selectAll()
      .where("id", "=", productId)
      .execute();

    return product;
  } catch (error) {
    return { error: "Could not find the product" };
  }
});

async function enableForeignKeyChecks() {
  await sql`SET foreign_key_checks = 1`.execute(db);
}

async function disableForeignKeyChecks() {
  await sql`SET foreign_key_checks = 0`.execute(db);
}

export async function deleteProduct(productId: number) {
  try {
    await disableForeignKeyChecks();
    await db
      .deleteFrom("product_categories")
      .where("product_categories.product_id", "=", productId)
      .execute();
    await db
      .deleteFrom("reviews")
      .where("reviews.product_id", "=", productId)
      .execute();

    await db
      .deleteFrom("comments")
      .where("comments.product_id", "=", productId)
      .execute();

    await db.deleteFrom("products").where("id", "=", productId).execute();

    await enableForeignKeyChecks();
    revalidatePath("/products");
    return { message: "success" };
  } catch (error) {
    return { error: "Something went wrong, Cannot delete the product" };
  }
}

export async function MapBrandIdsToName(brandsId) {
  const brandsMap = new Map();
  try {
    for (let i = 0; i < brandsId.length; i++) {
      const brandId = brandsId.at(i);
      const brand = await db
        .selectFrom("brands")
        .select("name")
        .where("id", "=", +brandId)
        .executeTakeFirst();
      brandsMap.set(brandId, brand?.name);
    }
    return brandsMap;
  } catch (error) {
    throw error;
  }
}

export async function getAllProductCategories(products: any) {
  try {
    const productsId = products.map((product) => product.id);
    const categoriesMap = new Map();

    for (let i = 0; i < productsId.length; i++) {
      const productId = productsId.at(i);
      const categories = await db
        .selectFrom("product_categories")
        .innerJoin(
          "categories",
          "categories.id",
          "product_categories.category_id"
        )
        .select("categories.name")
        .where("product_categories.product_id", "=", productId)
        .execute();
      categoriesMap.set(productId, categories);
    }
    return categoriesMap;
  } catch (error) {
    throw error;
  }
}

export async function getProductCategories(productId: number) {
  try {
    const categories = await db
      .selectFrom("product_categories")
      .innerJoin(
        "categories",
        "categories.id",
        "product_categories.category_id"
      )
      .select(["categories.id", "categories.name"])
      .where("product_categories.product_id", "=", productId)
      .execute();

    return categories;
  } catch (error) {
    throw error;
  }
}

export async function createProduct(productData: InsertProducts) {
  try {
    const {
      name,
      description,
      price,
      old_price,
      discount,
      rating,
      colors,
      brands,
      gender,
      occasion,
      image_url,
    } = productData;

    // 1. Insert into products
    const product = await db
      .insertInto("products")
      .values({
        name,
        description,
        price,
        old_price,
        discount,
        rating,
        colors,
        brands: JSON.stringify(brands),
        gender,
        occasion: JSON.stringify(occasion),
        image_url,
      }).executeTakeFirst();

    // product.insertId is new product id
    const insertedProduct = await db
      .selectFrom("products")
      .selectAll()
      .where("id", "=", product.insertId)
      .executeTakeFirst();

    revalidatePath("/products");
    return { message: "Product created successfully", insertedProduct };
  } catch (error) {
    console.error("Create Product Error:", error);
    return { error: "Failed to create product" };
  }
}

export async function updateProduct(productId: number, productData: UpdateProducts) {
  try {

    const {
      name,
      description,
      price,
      old_price,
      discount,
      rating,
      colors,
      brands,
      gender,
      occasion,
      image_url,
    } = productData;

    const product = await db
      .updateTable("products")
      .set({
        name,
        description,
        price,
        old_price,
        discount,
        rating,
        colors,
        brands: JSON.stringify(brands),
        gender,
        occasion: JSON.stringify(occasion),
        image_url
      })
      .where("id", "=", productId)
      .executeTakeFirst();

    // product.updateId is new product id
    const updatedProduct = await db
      .selectFrom("products")
      .selectAll()
      .where("id", "=", product.updateId)
      .executeTakeFirst();

    revalidatePath("/products");
    return { message: "Product updated successfully", product: updatedProduct };
  } catch (error) {
    console.error("Update Product Error:", error);
    return { error: "Failed to update product" };
  }
}

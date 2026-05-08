import { db } from "./index";
import bcrypt from "bcryptjs";

async function main() {
  console.log("🌱 Seeding database...");

  const passwordHash = await bcrypt.hash("password123", 12);

  const user = await db.user.upsert({
    where: { email: "admin@launchtic.com" },
    update: {},
    create: {
      email: "admin@launchtic.com",
      passwordHash,
      name: "Admin",
      ownedWorkspaces: {
        create: {
          name: "My Workspace",
          slug: "my-workspace",
          plan: "FREE",
          members: {
            create: {
              role: "OWNER",
              user: {
                connect: { email: "admin@launchtic.com" },
              },
            },
          },
        },
      },
    },
  });

  console.log("✅ Seeded user:", user.email);
  console.log("🎉 Done!");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());

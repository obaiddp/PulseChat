const { PrismaClient } = require("@prisma/client")
const bcrypt = require("bcrypt")
const prisma = new PrismaClient()

async function main() {

    // ======================== System User (needed for room createdById FK)
    const systemUser = await prisma.user.upsert({
        where: { email: "system@pulsechat.com" },
        update: {},
        create: {
            name: "System",
            email: "system@pulsechat.com",
            password: await bcrypt.hash("system-secret", 10),
            active: false
        }
    })
    console.log("✅ System user ready:", systemUser.id)

    // ======================== Default Public Rooms
    const defaultRooms = ["Cricket", "Football", "Hockey", "Basketball"]

    for (const name of defaultRooms) {
        const room = await prisma.room.upsert({
            where: { name },
            update: {},
            create: {
                name,
                createdById: systemUser.id
            }
        })
        console.log("✅ Room seeded:", room.name, "→", room.id)
    }

    console.log("\n🎉 Seeding complete!")
}

main()
    .catch((e) => {
        console.error("❌ Seed failed:", e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())

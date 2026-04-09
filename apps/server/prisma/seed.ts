import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const builtinTemplates = [
  {
    id: "tpl_order_flow",
    name: "标准订单流程",
    category: "flow",
    diagramType: "flowchart",
    templateJson: {
      elements: [
        { id: "f1", type: "rectangle", x: 80, y: 100, width: 180, height: 80, text: "创建订单" },
        { id: "f2", type: "rectangle", x: 360, y: 100, width: 180, height: 80, text: "支付" },
        { id: "f3", type: "rectangle", x: 640, y: 100, width: 180, height: 80, text: "履约发货" },
        {
          id: "fe1",
          type: "arrow",
          x: 200,
          y: 140,
          text: "f1->f2",
          meta: { fromId: "f1", toId: "f2" }
        },
        {
          id: "fe2",
          type: "arrow",
          x: 500,
          y: 140,
          text: "f2->f3",
          meta: { fromId: "f2", toId: "f3" }
        }
      ]
    }
  }
];

const builtinIcons = [
  { id: "icon_user", name: "User", category: "system", source: "builtin", tags: "user,account" },
  { id: "icon_service", name: "Service", category: "system", source: "builtin", tags: "service,api" },
  { id: "icon_database", name: "Database", category: "system", source: "builtin", tags: "database,storage" },
  { id: "icon_queue", name: "Queue", category: "system", source: "builtin", tags: "queue,mq,async" }
];

async function main(): Promise<void> {
  for (const template of builtinTemplates) {
    await prisma.template.upsert({
      where: { id: template.id },
      update: {
        name: template.name,
        category: template.category,
        diagramType: template.diagramType,
        templateJson: JSON.stringify(template.templateJson),
        isBuiltin: true
      },
      create: {
        id: template.id,
        name: template.name,
        category: template.category,
        diagramType: template.diagramType,
        templateJson: JSON.stringify(template.templateJson),
        isBuiltin: true
      }
    });
  }

  for (const icon of builtinIcons) {
    await prisma.icon.upsert({
      where: { id: icon.id },
      update: icon,
      create: icon
    });
  }

  await prisma.modelProfile.deleteMany({
    where: {
      id: {
        in: ["profile_openai_quality", "profile_anthropic_backup"]
      }
    }
  });

  await prisma.appSetting.updateMany({
    where: {
      defaultModelProfileId: {
        in: ["profile_openai_quality", "profile_anthropic_backup"]
      }
    },
    data: {
      defaultModelProfileId: null
    }
  });

  await prisma.appSetting.upsert({
    where: { id: 1 },
    update: {
      temperature: 0.2,
      maxTokens: 4096,
      theme: "system"
    },
    create: {
      id: 1,
      defaultModelProfileId: null,
      temperature: 0.2,
      maxTokens: 4096,
      theme: "system"
    }
  });
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

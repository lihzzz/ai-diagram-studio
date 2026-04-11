import { PrismaClient } from "@prisma/client";
import { DEFAULT_RENDER_CONFIG, MINIMAL_LIGHT_RENDER_CONFIG } from "@ai-diagram-studio/shared";

const prisma = new PrismaClient();

const builtinStyleTemplates = [
  {
    id: "tpl_default_style",
    name: "默认风格",
    category: "style",
    diagramType: "flowchart",
    templateJson: { version: 1 },
    stylePrompt: "Use a clean modern style with balanced spacing, clear hierarchy, and readable labels.",
    renderConfigJson: DEFAULT_RENDER_CONFIG
  },
  {
    id: "tpl_minimal_light_style",
    name: "极简浅色",
    category: "style",
    diagramType: "flowchart",
    templateJson: { version: 1 },
    stylePrompt: "Apple-style minimal design: light gray (#F8F8F8) background, soft rounded corners, muted gray (#B0B0B0) edges, subtle grid, low contrast, clean and airy like macOS document icons.",
    renderConfigJson: MINIMAL_LIGHT_RENDER_CONFIG
  }
];

const builtinIcons = [
  { id: "icon_user", name: "User", category: "system", source: "builtin", tags: "user,account" },
  { id: "icon_service", name: "Service", category: "system", source: "builtin", tags: "service,api" },
  { id: "icon_database", name: "Database", category: "system", source: "builtin", tags: "database,storage" },
  { id: "icon_queue", name: "Queue", category: "system", source: "builtin", tags: "queue,mq,async" }
];

async function main(): Promise<void> {
  for (const template of builtinStyleTemplates) {
    await prisma.template.upsert({
      where: { id: template.id },
      update: {
        name: template.name,
        category: template.category,
        diagramType: template.diagramType,
        templateJson: JSON.stringify(template.templateJson),
        stylePrompt: template.stylePrompt,
        renderConfigJson: template.renderConfigJson ? JSON.stringify(template.renderConfigJson) : null,
        previewImagePath: null,
        isBuiltin: true
      },
      create: {
        id: template.id,
        name: template.name,
        category: template.category,
        diagramType: template.diagramType,
        templateJson: JSON.stringify(template.templateJson),
        stylePrompt: template.stylePrompt,
        renderConfigJson: template.renderConfigJson ? JSON.stringify(template.renderConfigJson) : null,
        previewImagePath: null,
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

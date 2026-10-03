import { createDefaultResumeDocument } from "../core/resume/createResumeDocument";
import type {
  ContactPoint,
  ExperienceItem,
  Link,
  LocalizedContent,
  LocalizedText,
  ProjectItem,
  ResumeDocument,
  ResumeSection,
  SectionItemId,
  SkillsSection,
  SkillItem,
} from "../types/resume";

const ZH = "zh-CN";
const EN = "en-US";

const text = (zh: string, en = zh): LocalizedContent => ({
  defaultLocale: ZH,
  values: { [ZH]: zh, [EN]: en },
  sourceByLocale: {
    [ZH]: { kind: "user", createdAt: "2026-01-01T00:00:00.000Z" },
    [EN]: { kind: "user", createdAt: "2026-01-01T00:00:00.000Z" },
  },
});

const label = (zh: string, en = zh): LocalizedText => ({
  defaultLocale: ZH,
  values: { [ZH]: zh, [EN]: en },
});

const createIds = () => {
  const counters = new Map<string, number>();
  return (prefix: string): string => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}_example_${next}`;
  };
};

const asItemId = (value: string): SectionItemId => value as SectionItemId;

const contact = (
  id: string,
  type: ContactPoint["type"],
  zhValue: string,
  enValue = zhValue,
  url?: string,
): ContactPoint => ({
  id,
  type,
  value: text(zhValue, enValue),
  ...(url ? { url } : {}),
  visible: true,
});

const link = (id: string, zhLabel: string, url: string): Link => ({
  id,
  label: label(zhLabel),
  url,
});

const findSection = <T extends ResumeSection>(document: ResumeDocument, type: T["type"]): T => {
  const section = Object.values(document.content.sections).find((candidate) => candidate.type === type);
  if (!section) throw new Error(`Example document is missing ${type} section.`);
  return section as T;
};

export function createExampleResume(): ResumeDocument {
  const ids = createIds();
  const document = createDefaultResumeDocument({
    locale: ZH,
    now: () => "2026-01-01T00:00:00.000Z",
    idFactory: ids,
  });
  document.supportedLocales = [ZH, EN];
  document.metadata.title = text("林默｜产品设计师 · 5 年经验", "Mo Lin | Product Designer · 5 Years");
  document.metadata.jobTarget = {
    title: label("产品设计师", "Product Designer"),
    keywords: ["Figma", "user research", "design systems", "体验设计"],
  };
  document.content.profile.name = text("林默", "Mo Lin");
  document.content.profile.headline = text("产品设计师 · 5 年经验", "Product Designer · 5 Years");
  document.content.profile.summary = text(
    "专注于复杂产品的体验设计与系统化落地。擅长从用户研究、信息架构到上线迭代，和工程团队一起把模糊的问题变成清晰、可衡量的体验。",
    "Focused on experience design and systematic delivery for complex products, from user research and information architecture to launch iteration.",
  );
  document.content.profile.contacts = [
    contact("contact_location", "location", "上海", "Shanghai"),
    contact("contact_phone", "phone", "+86 138 0000 0000"),
    contact("contact_email", "email", "linmo@framework.design"),
  ];
  document.content.profile.links = [
    link("link_portfolio", "作品集", "https://framework.design/linmo"),
  ];

  const experience = findSection<Extract<ResumeDocument["content"]["sections"][string], { type: "experience" }>>(document, "experience");
  const experienceItems: ExperienceItem[] = [
    {
      id: asItemId("experience_example_1"),
      role: text("高级产品设计师", "Senior Product Designer"),
      company: text("Arc Studio · 上海", "Arc Studio · Shanghai"),
      location: text("上海", "Shanghai"),
      period: { start: "2022-03", isCurrent: true, display: label("2022.03 — 至今", "Mar 2022 — Present") },
      bullets: [
        text("主导 B 端协作平台 0–1 设计，服务 12 万+ 活跃用户，核心任务完成率提升 31%。", "Led 0–1 design for a B2B collaboration platform serving 120k+ active users, increasing core task completion by 31%."),
        text("搭建设计系统与组件文档，推动 4 条产品线统一交付语言。", "Built a design system and component documentation to align delivery language across four product lines."),
      ],
      links: [],
    },
    {
      id: asItemId("experience_example_2"),
      role: text("产品设计师", "Product Designer"),
      company: text("拾光科技 · 杭州", "Shiguang Technology · Hangzhou"),
      location: text("杭州", "Hangzhou"),
      period: { start: "2019-07", end: "2022-02", display: label("2019.07 — 2022.02", "Jul 2019 — Feb 2022") },
      bullets: [
        text("负责增长与内容产品，完成 20+ 次定性研究并沉淀用户旅程地图。", "Owned growth and content products, completing 20+ qualitative studies and journey maps."),
        text("重构新手引导流程，激活率提升 18%，获得年度体验创新奖。", "Redesigned onboarding, increasing activation by 18% and earning the annual experience innovation award."),
      ],
      links: [],
    },
  ];
  for (const item of experienceItems) {
    experience.items[item.id] = item;
    experience.itemOrder.push(item.id);
  }
  experience.title = text("工作经历", "Experience");

  const education = findSection<Extract<ResumeDocument["content"]["sections"][string], { type: "education" }>>(document, "education");
  education.title = text("教育经历", "Education");
  education.visible = false;

  const projects = findSection<Extract<ResumeDocument["content"]["sections"][string], { type: "projects" }>>(document, "projects");
  const projectItem: ProjectItem = {
    id: asItemId("project_example_1"),
    name: text("协作空间 2.0", "Collaboration Space 2.0"),
    description: text("重新定义团队从想法到交付的工作流。通过可视化状态与智能提醒，减少跨团队同步成本。", "Redefined the team workflow from idea to delivery. Visual status and smart reminders reduced cross-team coordination costs."),
    period: { start: "2023", end: "2023", display: label("2023", "2023") },
    bullets: [],
    links: [],
  };
  projects.items[projectItem.id] = projectItem;
  projects.itemOrder.push(projectItem.id);
  projects.title = text("项目经历", "Selected Projects");

  const skills = findSection<SkillsSection>(document, "skills");
  const skillItems: SkillItem[] = [
    { id: asItemId("skill_example_1"), name: text("用户研究", "User Research"), keywords: ["访谈", "可用性测试"] },
    { id: asItemId("skill_example_2"), name: text("体验策略", "Experience Strategy"), keywords: [] },
    { id: asItemId("skill_example_3"), name: text("Figma", "Figma"), level: "expert", keywords: ["组件", "原型"] },
    { id: asItemId("skill_example_4"), name: text("设计系统", "Design Systems"), keywords: ["组件文档"] },
    { id: asItemId("skill_example_5"), name: text("原型与测试", "Prototyping & Testing"), keywords: [] },
    { id: asItemId("skill_example_6"), name: text("数据分析", "Data Analysis"), keywords: [] },
  ];
  for (const item of skillItems) {
    skills.items[item.id] = item;
    skills.itemOrder.push(item.id);
  }
  skills.title = text("技能", "Skills");

  return document;
}

export const exampleResume: ResumeDocument = createExampleResume();

import { memo } from "react";
import { Search, Clock, Mail, Code, ChartLine, Bell } from "lucide-react";
import icon from "../../assets/lingxia.svg";
import { useI18n } from "../../components/useI18n";

interface Suggestion {
  i18nKey: string;
  text: string;
  Icon: typeof Search;
}

const SUGGESTIONS: Suggestion[] = [
  {
    i18nKey: "chat.suggestionSearch",
    text: "搜索今天的行业热点新闻",
    Icon: Search,
  },
  {
    i18nKey: "chat.suggestionReminder",
    text: "设置每天早上 9 点查看邮件的提醒",
    Icon: Bell,
  },
  {
    i18nKey: "chat.suggestionEmail",
    text: "读取我最新的邮件并做简要总结",
    Icon: Mail,
  },
  {
    i18nKey: "chat.suggestionScript",
    text: "写一个 Python 脚本批量重命名文件夹中的文件",
    Icon: Code,
  },
  {
    i18nKey: "chat.suggestionSchedule",
    text: "创建一个定时任务，每晚自动备份数据库",
    Icon: Clock,
  },
  {
    i18nKey: "chat.suggestionAnalyze",
    text: "分析这个 CSV 文件并提取关键数据洞察",
    Icon: ChartLine,
  },
];

interface ChatEmptyStateProps {
  onSelectSuggestion: (text: string) => void;
}

export const ChatEmptyState = memo(function ChatEmptyState({
  onSelectSuggestion,
}: ChatEmptyStateProps): React.JSX.Element {
  const { t } = useI18n();

  return (
    <div className="chat-empty">
      <div className="chat-empty-icon">
        <img src={icon} width={64} height={64} alt="" />
      </div>
      <div className="chat-empty-text">{t("chat.emptyTitle")}</div>
      <div className="chat-empty-hint">{t("chat.emptyHint")}</div>
      <div className="chat-empty-suggestions">
        {SUGGESTIONS.map(({ i18nKey, text, Icon }) => (
          <button
            key={i18nKey}
            className="chat-suggestion"
            onClick={() => onSelectSuggestion(text)}
          >
            <Icon size={16} />
            {t(i18nKey)}
          </button>
        ))}
      </div>
    </div>
  );
});

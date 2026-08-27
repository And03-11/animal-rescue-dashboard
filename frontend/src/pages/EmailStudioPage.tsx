import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import DesktopWindowsRoundedIcon from '@mui/icons-material/DesktopWindowsRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import FileUploadRoundedIcon from '@mui/icons-material/FileUploadRounded';
import MobileFriendlyRoundedIcon from '@mui/icons-material/MobileFriendlyRounded';
import PreviewRoundedIcon from '@mui/icons-material/PreviewRounded';
import RedoRoundedIcon from '@mui/icons-material/RedoRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import WebRoundedIcon from '@mui/icons-material/WebRounded';
import axios from 'axios';
import grapesjs, { type Editor, type ProjectData } from 'grapesjs';
import presetNewsletter from 'grapesjs-preset-newsletter';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';

import 'grapesjs/dist/css/grapes.min.css';
import './email-studio.css';
import apiClient from '../api/axiosConfig';

interface EmailTemplate {
  id: number;
  name: string;
  content: string;
  design_json?: string | null;
}

type InspectorTab = 'styles' | 'settings';
type DeviceName = 'Desktop' | 'Mobile';

const blankEmail = `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f1f6f4;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <tbody><tr><td align="center">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;">
      <tbody>
        <tr><td data-gjs-droppable="true" style="height:520px;min-height:520px;background:#ffffff;padding:0;"></td></tr>
      </tbody>
    </table>
  </td></tr></tbody>
</table>`;

const sanitizeImportedHtml = (rawHtml: string) => {
  const documentNode = new DOMParser().parseFromString(rawHtml, 'text/html');
  documentNode.querySelectorAll('script, iframe, object, embed, form, base').forEach((node) => node.remove());

  documentNode.querySelectorAll<HTMLElement>('*').forEach((node) => {
    Array.from(node.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith('on') || ((name === 'href' || name === 'src') && value.startsWith('javascript:'))) {
        node.removeAttribute(attribute.name);
      }
    });
  });

  const css = Array.from(documentNode.querySelectorAll('style'))
    .map((style) => style.textContent || '')
    .join('\n');
  documentNode.querySelectorAll('style').forEach((style) => style.remove());

  return { html: documentNode.body.innerHTML.trim(), css };
};

const loadHtmlIntoEditor = (editor: Editor, rawHtml: string) => {
  const { html, css } = sanitizeImportedHtml(rawHtml);
  editor.setComponents(html || blankEmail);
  editor.setStyle(css);
  editor.UndoManager.clear();
};

const buildPortableHtml = (editor: Editor) => {
  const inlined = editor.runCommand('gjs-get-inlined-html') as string | undefined;
  const body = inlined || editor.getHtml();
  if (/<!doctype|<html[\s>]/i.test(body)) return body;
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>Email</title>\n</head>\n<body style="margin:0;padding:0;">${body}</body>\n</html>`;
};

const safeFilename = (name: string) =>
  (name || 'animal-love-email')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'animal-love-email';

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError<{ detail?: string }>(error)) return fallback;
  return error.response?.data?.detail || fallback;
};

export default function EmailStudioPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const templateId = searchParams.get('template');
  const shouldOpenImporter = searchParams.get('mode') === 'import';

  const editorHostRef = useRef<HTMLDivElement>(null);
  const blockHostRef = useRef<HTMLDivElement>(null);
  const styleHostRef = useRef<HTMLDivElement>(null);
  const traitHostRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const importerOpenedRef = useRef(false);

  const [name, setName] = useState('Untitled email');
  const [activeTemplateId, setActiveTemplateId] = useState<number | null>(null);
  const [loading, setLoading] = useState(Boolean(templateId));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [ready, setReady] = useState(false);
  const [device, setDevice] = useState<DeviceName>('Desktop');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('styles');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const installBrandBlocks = useCallback((editor: Editor) => {
    const blocks = editor.Blocks;
    blocks.add('animal-love-header', {
      label: 'Brand header',
      category: 'Animal love',
      attributes: { class: 'gjs-fonts gjs-f-b1' },
      content: '<table role="presentation" width="100%"><tbody><tr><td style="padding:24px 32px;background:#087a70;color:#fff;font:700 20px Arial,sans-serif;">Animal love <span style="color:#8de6d7;">Rescue Center</span></td></tr></tbody></table>',
    });
    blocks.add('animal-love-story', {
      label: 'Story section',
      category: 'Animal love',
      attributes: { class: 'gjs-fonts gjs-f-text' },
      content: '<table role="presentation" width="100%"><tbody><tr><td style="padding:36px 40px;background:#fff;"><h2 style="margin:0 0 14px;color:#102521;font:700 30px/1.2 Arial,sans-serif;">A rescue story</h2><p style="margin:0;color:#49615c;font:16px/1.65 Arial,sans-serif;">Share the update your supporters need to know.</p></td></tr></tbody></table>',
    });
    blocks.add('animal-love-cta', {
      label: 'Donation button',
      category: 'Animal love',
      attributes: { class: 'gjs-fonts gjs-f-button' },
      content: '<table role="presentation" width="100%"><tbody><tr><td align="center" style="padding:24px 40px;background:#fff;"><a href="#" style="display:inline-block;padding:14px 24px;border-radius:10px;background:#d86f45;color:#fff;text-decoration:none;font:700 16px Arial,sans-serif;">Donate now</a></td></tr></tbody></table>',
    });
    blocks.add('animal-love-divider', {
      label: 'Divider',
      category: 'Animal love',
      attributes: { class: 'gjs-fonts gjs-f-divider' },
      content: '<table role="presentation" width="100%"><tbody><tr><td style="padding:12px 40px;background:#fff;"><div style="height:1px;background:#d7e5e1;"></div></td></tr></tbody></table>',
    });
    blocks.add('animal-love-footer', {
      label: 'Email footer',
      category: 'Animal love',
      attributes: { class: 'gjs-fonts gjs-f-text' },
      content: '<table role="presentation" width="100%"><tbody><tr><td style="padding:22px 40px;background:#e8f3f0;color:#58716b;text-align:center;font:12px/1.55 Arial,sans-serif;">Animal love Rescue Center · Costa Rica<br><a href="*|UNSUB|*" style="color:#087a70;">Unsubscribe</a></td></tr></tbody></table>',
    });
  }, []);

  useEffect(() => {
    if (!editorHostRef.current || !blockHostRef.current || !styleHostRef.current || !traitHostRef.current) return;

    const editor = grapesjs.init({
      container: editorHostRef.current,
      height: '100%',
      width: 'auto',
      fromElement: false,
      storageManager: false,
      panels: { defaults: [] },
      selectorManager: { componentFirst: true },
      blockManager: { appendTo: blockHostRef.current },
      traitManager: { appendTo: traitHostRef.current },
      styleManager: {
        appendTo: styleHostRef.current,
        sectors: [
          {
            name: 'Typography', open: true,
            properties: ['font-family', 'font-size', 'font-weight', 'color', 'line-height', 'letter-spacing', 'text-align', 'text-decoration'],
          },
          {
            name: 'Spacing', open: true,
            properties: ['padding', 'margin'],
          },
          {
            name: 'Surface', open: false,
            properties: ['background-color', 'border', 'border-radius', 'opacity'],
          },
          {
            name: 'Dimensions', open: false,
            properties: ['width', 'max-width', 'min-height'],
          },
        ],
      },
      deviceManager: {
        devices: [
          { id: 'Desktop', name: 'Desktop', width: '' },
          { id: 'Mobile', name: 'Mobile', width: '390px', widthMedia: '480px' },
        ],
      },
      plugins: [
        (instance) => presetNewsletter(instance, {
          inlineCss: true,
          showBlocksOnLoad: false,
          showStylesOnChange: false,
          updateStyleManager: false,
          useCustomTheme: false,
        }),
      ],
    });

    editorRef.current = editor;
    installBrandBlocks(editor);

    const markDirty = () => setDirty(true);
    editor.on('update', markDirty);
    editor.on('component:selected', () => setInspectorTab('styles'));

    const loadInitialProject = async () => {
      try {
        if (templateId) {
          setLoading(true);
          const response = await apiClient.get<EmailTemplate>(`/templates/${templateId}`, { timeout: 15_000 });
          const template = response.data;
          setName(template.name);
          setActiveTemplateId(template.id);

          if (template.design_json) {
            try {
              editor.loadProjectData(JSON.parse(template.design_json) as ProjectData);
            } catch {
              loadHtmlIntoEditor(editor, template.content);
            }
          } else {
            loadHtmlIntoEditor(editor, template.content);
          }
        } else {
          loadHtmlIntoEditor(editor, blankEmail);
        }
        editor.UndoManager.clear();
        setDirty(false);
      } catch (requestError) {
        setError(getApiErrorMessage(requestError, 'The email project could not be loaded.'));
        loadHtmlIntoEditor(editor, blankEmail);
      } finally {
        setLoading(false);
        setReady(true);
      }
    };

    editor.on('load', loadInitialProject);

    return () => {
      editor.off('update', markDirty);
      editor.destroy();
      editorRef.current = null;
    };
  }, [installBrandBlocks, templateId]);

  useEffect(() => {
    if (ready && shouldOpenImporter && !importerOpenedRef.current) {
      importerOpenedRef.current = true;
      fileInputRef.current?.click();
    }
  }, [ready, shouldOpenImporter]);

  const handleDevice = (nextDevice: DeviceName) => {
    editorRef.current?.setDevice(nextDevice);
    setDevice(nextDevice);
  };

  const handleImport = async (file?: File) => {
    if (!file || !editorRef.current) return;
    if (!/\.html?$/i.test(file.name) && file.type !== 'text/html') {
      setError('Choose an .html or .htm file.');
      return;
    }
    try {
      const html = await file.text();
      loadHtmlIntoEditor(editorRef.current, html);
      setName(file.name.replace(/\.html?$/i, '') || 'Imported email');
      setActiveTemplateId(null);
      setDirty(true);
      setSearchParams({}, { replace: true });
      setNotice('HTML imported. Select any text or block to edit it.');
    } catch {
      setError('The HTML file could not be read.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    const editor = editorRef.current;
    if (!editor || !name.trim()) {
      setError('Give this email a name before saving.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        content: buildPortableHtml(editor),
        design_json: JSON.stringify(editor.getProjectData()),
      };
      const response = activeTemplateId
        ? await apiClient.put<EmailTemplate>(`/templates/${activeTemplateId}`, payload)
        : await apiClient.post<EmailTemplate>('/templates', payload);
      setActiveTemplateId(response.data.id);
      setSearchParams({ template: String(response.data.id) }, { replace: true });
      setDirty(false);
      setNotice(activeTemplateId ? 'Email changes saved.' : 'Email saved as a reusable template.');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'The email could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const blob = new Blob([buildPortableHtml(editor)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeFilename(name)}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('Portable HTML downloaded.');
  };

  const handleBack = () => {
    if (!dirty || window.confirm('You have unsaved changes. Leave the Email Studio?')) {
      navigate('/templates');
    }
  };

  return (
    <Box className="email-studio-shell">
      <Paper className="email-studio-toolbar" variant="outlined">
        <Stack direction="row" alignItems="center" gap={1.25} className="email-studio-toolbar__identity">
          <Tooltip title="Back to templates">
            <IconButton aria-label="Back to templates" onClick={handleBack} size="small">
              <ArrowBackRoundedIcon />
            </IconButton>
          </Tooltip>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" alignItems="center" gap={1}>
              <Typography variant="overline" color="primary.main">Email Studio</Typography>
              {dirty && <Chip label="Unsaved" size="small" color="warning" variant="outlined" />}
            </Stack>
            <TextField
              value={name}
              onChange={(event) => { setName(event.target.value); setDirty(true); }}
              variant="standard"
              aria-label="Email project name"
              className="email-studio-name"
              inputProps={{ maxLength: 120 }}
            />
          </Box>
        </Stack>

        <Stack direction="row" alignItems="center" gap={0.5} className="email-studio-toolbar__tools">
          <Tooltip title="Undo"><span><IconButton aria-label="Undo" onClick={() => editorRef.current?.runCommand('core:undo')} disabled={!ready}><UndoRoundedIcon /></IconButton></span></Tooltip>
          <Tooltip title="Redo"><span><IconButton aria-label="Redo" onClick={() => editorRef.current?.runCommand('core:redo')} disabled={!ready}><RedoRoundedIcon /></IconButton></span></Tooltip>
          <Divider orientation="vertical" flexItem />
          <Tooltip title="Desktop preview"><IconButton aria-label="Desktop preview" color={device === 'Desktop' ? 'primary' : 'default'} onClick={() => handleDevice('Desktop')}><DesktopWindowsRoundedIcon /></IconButton></Tooltip>
          <Tooltip title="Mobile preview"><IconButton aria-label="Mobile preview" color={device === 'Mobile' ? 'primary' : 'default'} onClick={() => handleDevice('Mobile')}><MobileFriendlyRoundedIcon /></IconButton></Tooltip>
          <Tooltip title="Preview without editor guides"><IconButton aria-label="Toggle preview" onClick={() => editorRef.current?.runCommand('preview')}><PreviewRoundedIcon /></IconButton></Tooltip>
          <Divider orientation="vertical" flexItem />
          <input ref={fileInputRef} type="file" accept=".html,.htm,text/html" hidden onChange={(event) => handleImport(event.target.files?.[0])} />
          <Button variant="text" startIcon={<FileUploadRoundedIcon />} onClick={() => fileInputRef.current?.click()}>Import HTML</Button>
          <Button variant="outlined" startIcon={<DownloadRoundedIcon />} onClick={handleDownload} disabled={!ready}>Export HTML</Button>
          <Button variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveRoundedIcon />} onClick={handleSave} disabled={saving || loading}>Save</Button>
        </Stack>
      </Paper>

      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

      <Box className="email-studio-workspace">
        <Paper className="email-studio-panel email-studio-panel--blocks" variant="outlined">
          <Box className="email-studio-panel__heading">
            <WebRoundedIcon color="primary" fontSize="small" />
            <Box>
              <Typography variant="subtitle2">Content library</Typography>
              <Typography variant="caption" color="text.secondary">Drag blocks into the email</Typography>
            </Box>
          </Box>
          <Divider />
          <Box ref={blockHostRef} className="email-studio-blocks" />
        </Paper>

        <Paper className="email-studio-canvas-wrap" variant="outlined">
          {loading && (
            <Stack className="email-studio-loading" alignItems="center" justifyContent="center" gap={1.5}>
              <CircularProgress size={28} />
              <Typography variant="body2" color="text.secondary">Opening email project…</Typography>
            </Stack>
          )}
          <Box ref={editorHostRef} className="email-studio-canvas" />
        </Paper>

        <Paper className="email-studio-panel email-studio-panel--inspector" variant="outlined">
          <Tabs value={inspectorTab} onChange={(_, value: InspectorTab) => setInspectorTab(value)} variant="fullWidth" aria-label="Email inspector">
            <Tab value="styles" label="Styles" icon={<CodeRoundedIcon />} iconPosition="start" />
            <Tab value="settings" label="Settings" icon={<WebRoundedIcon />} iconPosition="start" />
          </Tabs>
          <Divider />
          <Box className="email-studio-inspector" sx={{ display: inspectorTab === 'styles' ? 'block' : 'none' }}>
            <Box className="email-studio-tip">
              <Typography variant="caption" color="text.secondary">
                Select text to change its color, size, font, spacing, alignment or underline.
              </Typography>
            </Box>
            <Box ref={styleHostRef} />
          </Box>
          <Box className="email-studio-inspector" sx={{ display: inspectorTab === 'settings' ? 'block' : 'none' }}>
            <Box className="email-studio-tip">
              <Typography variant="caption" color="text.secondary">
                Select a button, image or link to edit its destination and content.
              </Typography>
            </Box>
            <Box ref={traitHostRef} />
          </Box>
        </Paper>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} className="email-studio-footer-note">
        <Typography variant="caption" color="text.secondary">Tip: double-click text to edit it directly. Changes are not saved automatically.</Typography>
        <Button component={RouterLink} to="/templates" size="small" color="inherit">View all templates</Button>
      </Stack>

      <Snackbar open={Boolean(notice)} autoHideDuration={4000} onClose={() => setNotice(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" onClose={() => setNotice(null)}>{notice}</Alert>
      </Snackbar>
    </Box>
  );
}

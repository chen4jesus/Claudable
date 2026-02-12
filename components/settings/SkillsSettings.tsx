/**
 * Skills Settings Component
 * Allows users to manage skills for a project - upload, view, and delete
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Trash2, FileText, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

interface Skill {
  name: string;
  description: string;
  path?: string;
}

interface SkillsSettingsProps {
  projectId: string;
}

export function SkillsSettings({ projectId }: SkillsSettingsProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSkills = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/projects/${projectId}/skills`);
      const data = await response.json();
      if (data.success) {
        setSkills(data.skills || []);
      } else {
        setError(data.error || 'Failed to load skills');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.zip')) {
      setError('Please select a .zip file');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setSuccess(null);

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/projects/${projectId}/skills/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        const extractedCount = data.data?.extractedSkills?.length || 0;
        setSuccess(`Successfully extracted ${extractedCount} skill${extractedCount !== 1 ? 's' : ''}`);
        fetchSkills(); // Refresh the skills list
      } else {
        setError(data.error || 'Failed to upload skills');
      }
    } catch (err) {
      setError('Failed to upload file');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteSkill = async (skillName: string) => {
    if (!confirm(`Are you sure you want to delete the skill "${skillName}"?`)) {
      return;
    }

    try {
      setError(null);
      const response = await fetch(`/api/projects/${projectId}/skills/${skillName}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(`Skill "${skillName}" deleted`);
        fetchSkills();
      } else {
        setError(data.error || 'Failed to delete skill');
      }
    } catch (err) {
      setError('Failed to delete skill');
    }
  };

  // Clear success message after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Skills</h3>
          <p className="text-sm text-gray-500 mt-1">
            Upload skill packages to enhance Claude&apos;s capabilities for this project
          </p>
        </div>
        <button
          onClick={handleUploadClick}
          disabled={uploading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {uploading ? 'Uploading...' : 'Upload Skills.zip'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* Skills List */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-8 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading skills...
          </div>
        ) : skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-gray-500">
            <FileText className="w-10 h-10 mb-2 text-gray-300" />
            <p className="font-medium">No skills installed</p>
            <p className="text-sm mt-1">
              Upload a skills.zip file to get started
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {skills.map((skill) => (
                <tr key={skill.name} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">{skill.name}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {skill.description || <span className="text-gray-400 italic">No description</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDeleteSkill(skill.name)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete skill"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Help text */}
      <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
        <p className="font-medium mb-1">How skills work:</p>
        <ul className="list-disc list-inside space-y-0.5 text-gray-400">
          <li>Skills are loaded from <code className="bg-gray-200 px-1 rounded">skills/</code> folder in your project</li>
          <li>Each skill folder must contain a <code className="bg-gray-200 px-1 rounded">SKILL.md</code> file</li>
          <li>Skills are automatically injected into Claude&apos;s instructions</li>
          <li>Get pre-built skills from <a href="https://github.com/anthropics/skills" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">github.com/anthropics/skills</a></li>
        </ul>
      </div>
    </div>
  );
}

export default SkillsSettings;

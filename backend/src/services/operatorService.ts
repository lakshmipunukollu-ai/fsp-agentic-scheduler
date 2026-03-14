import { query } from '../db/connection';
import { Operator, OperatorConfig, FeatureFlags, DEFAULT_OPERATOR_CONFIG, DEFAULT_FEATURE_FLAGS } from '../types';
import { AuditService } from './auditService';
import { AppError } from '../middleware/errorHandler';

export class OperatorService {
  static async getById(id: string): Promise<Operator> {
    const result = await query('SELECT * FROM operators WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      throw new AppError('Operator not found', 404);
    }
    return result.rows[0];
  }

  static async getConfig(operatorId: string): Promise<OperatorConfig> {
    const operator = await this.getById(operatorId);
    return { ...DEFAULT_OPERATOR_CONFIG, ...(operator.config as OperatorConfig) };
  }

  static async updateConfig(operatorId: string, configUpdate: Partial<OperatorConfig>, userId: string): Promise<OperatorConfig> {
    const current = await this.getConfig(operatorId);
    const updated = { ...current, ...configUpdate };

    if (configUpdate.priorityWeights) {
      updated.priorityWeights = { ...current.priorityWeights, ...configUpdate.priorityWeights };
    }

    await query(
      'UPDATE operators SET config = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(updated), operatorId]
    );

    await AuditService.log(operatorId, 'config_updated', `scheduler:${userId}`, undefined, {
      previous: current,
      updated,
    });

    return updated;
  }

  static async getFeatureFlags(operatorId: string): Promise<FeatureFlags> {
    const operator = await this.getById(operatorId);
    return { ...DEFAULT_FEATURE_FLAGS, ...(operator.feature_flags as FeatureFlags) };
  }

  static async updateFeatureFlags(operatorId: string, flagsUpdate: Partial<FeatureFlags>, userId: string): Promise<FeatureFlags> {
    const current = await this.getFeatureFlags(operatorId);
    const updated = { ...current, ...flagsUpdate };

    await query(
      'UPDATE operators SET feature_flags = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(updated), operatorId]
    );

    await AuditService.log(operatorId, 'feature_flags_updated', `scheduler:${userId}`, undefined, {
      previous: current,
      updated,
    });

    return updated;
  }
}
